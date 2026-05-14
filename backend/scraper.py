import os
import time
import random
from datetime import datetime, timezone
from urllib.parse import quote_plus
from sqlalchemy.exc import IntegrityError
from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

from database import SessionLocal
from models import Extraction, Place


def _random_delay(min_s: float = 1.0, max_s: float = 3.0) -> None:
    time.sleep(random.uniform(min_s, max_s))


def _save_place(db, extraction_id: str, data: dict) -> bool:
    """Save a place to DB. Returns True if saved, False if duplicate."""
    if not data.get("name"):
        return False
    place = Place(
        extraction_id=extraction_id,
        name=data.get("name"),
        address=data.get("address"),
        phone=data.get("phone"),
        website=data.get("website"),
        rating=data.get("rating"),
        rating_count=data.get("rating_count"),
        category=data.get("category"),
        opening_hours=data.get("opening_hours"),
        maps_url=data.get("maps_url"),
    )
    db.add(place)
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False  # duplicate — ignored


def _update_status(db, extraction_id: str, status: str, error_msg: str = None) -> None:
    extraction = db.get(Extraction, extraction_id)
    if not extraction:
        return
    extraction.status = status
    if error_msg:
        extraction.error_msg = error_msg
    if status in ("done", "error"):
        extraction.finished_at = datetime.now(tz=timezone.utc)
    db.commit()


def _increment_found(db, extraction_id: str) -> None:
    extraction = db.get(Extraction, extraction_id)
    if extraction:
        extraction.total_found += 1
        db.commit()


def _extract_place_details(page) -> dict:
    """Extract all fields from the currently open place detail panel."""
    data: dict = {}
    data["maps_url"] = page.url

    # Name
    try:
        data["name"] = page.locator("h1").first.inner_text(timeout=4000).strip()
    except Exception:
        data["name"] = None

    # Rating  (aria-label like "4,3 estrelas")
    try:
        aria = page.locator(
            "div[jsaction*='pane.rating'] span[aria-label], "
            "span[aria-label*='estrela']"
        ).first.get_attribute("aria-label", timeout=3000) or ""
        parts = aria.split()
        if parts:
            data["rating"] = float(parts[0].replace(",", "."))
    except Exception:
        data["rating"] = None

    # Rating count  (e.g. "(187)")
    try:
        text = page.locator(
            "button[jsaction*='pane.rating.moreReviews'] span, "
            "span[aria-label*='avalia']"
        ).first.inner_text(timeout=3000)
        count_str = text.strip().replace("(", "").replace(")", "").replace(".", "").replace(",", "")
        clean = count_str.rstrip("+")
        data["rating_count"] = int(clean) if clean.isdigit() else None
    except Exception:
        data["rating_count"] = None

    # Category
    try:
        data["category"] = page.locator("button.DkEaL").first.inner_text(timeout=2000).strip()
    except Exception:
        data["category"] = None

    # Address
    try:
        addr = page.locator("button[data-item-id='address']").first.get_attribute(
            "aria-label", timeout=3000
        ) or ""
        data["address"] = addr.replace("Endereço: ", "").strip() or None
    except Exception:
        data["address"] = None

    # Phone
    try:
        phone = page.locator("button[data-item-id^='phone']").first.get_attribute(
            "aria-label", timeout=3000
        ) or ""
        data["phone"] = phone.replace("Telefone: ", "").strip() or None
    except Exception:
        data["phone"] = None

    # Website
    try:
        data["website"] = page.locator("a[data-item-id='authority']").first.get_attribute(
            "href", timeout=3000
        )
    except Exception:
        data["website"] = None

    # Opening hours
    try:
        data["opening_hours"] = page.locator(
            "div[jsaction*='openhours'] div[aria-label], "
            "button[data-item-id*='oh'] div[aria-label]"
        ).first.get_attribute("aria-label", timeout=2000)
    except Exception:
        data["opening_hours"] = None

    return data


def _is_captcha(page) -> bool:
    """Detect Google CAPTCHA or reCAPTCHA on current page."""
    try:
        return (
            page.locator("iframe[src*='recaptcha']").count() > 0
            or "Our systems have detected unusual traffic" in page.content()
            or "captcha" in page.url.lower()
        )
    except Exception:
        return False


def run_extraction(extraction_id: str) -> None:
    """
    Main scraper entry point. Called by FastAPI BackgroundTasks.
    Opens Google Maps, scrolls through results, extracts and saves each place.
    """
    db = SessionLocal()
    try:
        _update_status(db, extraction_id, "running")
        extraction = db.get(Extraction, extraction_id)
        if not extraction:
            return

        query = f"{extraction.type} {extraction.city} {extraction.state}"
        search_url = "https://www.google.com/maps/search/" + quote_plus(query)
        max_results = extraction.max_results or 0  # 0 = sem limite

        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=False,
                args=["--start-maximized", "--disable-blink-features=AutomationControlled"],
            )
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
                locale="pt-BR",
                geolocation=None,
            )
            page = context.new_page()

            # Navigate to search results
            page.goto(search_url, wait_until="networkidle", timeout=30000)
            _random_delay(2, 4)

            if _is_captcha(page):
                _update_status(db, extraction_id, "error", "CAPTCHA detectado na busca inicial")
                browser.close()
                return

            # Wait for the results feed
            feed_selector = 'div[role="feed"]'
            try:
                page.wait_for_selector(feed_selector, timeout=15000)
            except PwTimeout:
                _update_status(db, extraction_id, "error", "Lista de resultados não carregou")
                browser.close()
                return

            seen_urls: set[str] = set()
            no_new_rounds = 0
            max_no_new = 4  # stop after 4 consecutive scrolls with no new results

            while True:
                # Collect result links currently visible in the feed
                links = page.locator(f'{feed_selector} a[href*="/maps/place/"]').all()
                hrefs = [
                    a.get_attribute("href")
                    for a in links
                    if a.get_attribute("href")
                ]
                new_hrefs = [h for h in hrefs if h.split("@")[0] not in seen_urls]

                if not new_hrefs:
                    no_new_rounds += 1
                    if no_new_rounds >= max_no_new:
                        break  # end of results list
                else:
                    no_new_rounds = 0

                # Visit each new place
                for href in new_hrefs:
                    # Check limit before visiting next place
                    if max_results > 0:
                        extraction = db.get(Extraction, extraction_id)
                        if extraction and extraction.total_found >= max_results:
                            browser.close()
                            _update_status(db, extraction_id, "done")
                            return

                    seen_urls.add(href.split("@")[0])
                    try:
                        page.goto(href, wait_until="networkidle", timeout=20000)
                        _random_delay(1.5, 3.0)

                        if _is_captcha(page):
                            _update_status(db, extraction_id, "error", "CAPTCHA detectado durante extração")
                            browser.close()
                            return

                        data = _extract_place_details(page)
                        data["maps_url"] = href
                        saved = _save_place(db, extraction_id, data)
                        if saved:
                            _increment_found(db, extraction_id)

                        # Go back to search results
                        page.goto(search_url, wait_until="networkidle", timeout=20000)
                        page.wait_for_selector(feed_selector, timeout=10000)
                        _random_delay(1.0, 2.0)

                    except PwTimeout:
                        # Timeout on individual place — skip and continue
                        page.goto(search_url, wait_until="networkidle", timeout=20000)
                        page.wait_for_selector(feed_selector, timeout=10000)
                        _random_delay(1.0, 2.0)
                    except Exception:
                        page.goto(search_url, wait_until="networkidle", timeout=20000)
                        page.wait_for_selector(feed_selector, timeout=10000)
                        _random_delay(1.0, 2.0)

                # Scroll the feed panel to load more results
                try:
                    feed = page.locator(feed_selector)
                    feed.evaluate("el => el.scrollBy(0, el.scrollHeight)")
                    _random_delay(2.0, 4.0)
                except Exception:
                    break

            browser.close()

        _update_status(db, extraction_id, "done")

    except Exception as e:
        try:
            _update_status(db, extraction_id, "error", str(e)[:500])
        except Exception:
            pass
    finally:
        db.close()
