from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    slug = "my-association"
    print(f"Verifying Org Detail Page for {slug}...")
    page.goto(f"http://localhost:8000/associazioni/{slug}")

    # Check Header
    # Use exact locator or nth to avoid conflict with base.html h1
    expect(page.locator(".org-header h1")).to_have_text("My Awesome Association")

    # Check Actions
    expect(page.locator(f"a[href='/join/{slug}']")).to_be_visible()

    # Check Login Link with Param
    login_link = page.locator("a.secondary-action")
    expect(login_link).to_be_visible()
    # Check href contains query param
    href = login_link.get_attribute("href")
    if f"/member/login?org={slug}" in href:
        print("   Login link correct.")
    else:
        raise Exception(f"Login link incorrect: {href}")

    page.screenshot(path="verification/org_detail_final.png")
    print("   Success")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
