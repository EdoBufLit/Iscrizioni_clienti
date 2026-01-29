from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # 1. Home CTA
    print("1. Checking Home CTA...")
    page.goto("http://localhost:8000/")
    page.click(".hero-cta")
    expect(page).to_have_url("http://localhost:8000/associazioni")
    print("   Success")

    # 2. Associazioni List
    print("2. Checking Associazioni List...")
    expect(page.locator("h2")).to_contain_text("Associazioni Affiliate")
    expect(page.locator(".associazioni-grid")).to_be_visible()

    # Check if cards exist (at least the seed one)
    if page.locator(".org-card").count() > 0:
        print(f"   Found {page.locator('.org-card').count()} cards.")

        # Test Search
        print("3. Testing Search...")
        page.fill("input[name='q']", "Awesome")
        page.click("button:has-text('Cerca')")
        # Should still see the card
        expect(page.locator(".org-card")).to_be_visible()

        # Test Click (Detail/Join redirect)
        print("4. Testing Card Click...")
        page.click(".org-card >> nth=0")
        # Should redirect to /join/{slug}
        # Using compiled regex or just checking string containment logic manually if expect fails
        import re
        expect(page).to_have_url(re.compile(r".*/join/.*"), timeout=5000)
        print("   Success")
    else:
        print("   Skipped card checks (no data)")

    page.screenshot(path="verification/associazioni_final.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
