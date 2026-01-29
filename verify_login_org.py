from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # 1. Login with Org Param
    print("1. Login with Org Param...")
    page.goto("http://localhost:8000/member/login?org=my-association")

    # Check Heading
    expect(page.locator("h4")).to_contain_text("Area soci — My Awesome Association")

    # Check Hidden Input
    hidden_input = page.locator("input[name='org']")
    expect(hidden_input).to_have_value("my-association")

    # 2. Submit Form
    print("2. Submit Form...")
    page.fill("input[name='email']", "test@example.com") # Any email works for UI check, backend just sends msg
    page.click("button:has-text('Send magic link')")

    # 3. Verify Success Message
    print("3. Verify Success Message...")
    # The message should say "access the member portal di My Awesome Association"
    expect(page.locator("body")).to_contain_text("di My Awesome Association")

    page.screenshot(path="verification/login_org_param.png")
    print("   Success")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
