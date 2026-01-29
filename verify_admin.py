from playwright.sync_api import sync_playwright, expect
import re

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Admin Login
        print("1. Admin Login")
        page.goto("http://localhost:8000/admin/login")
        page.fill("input[name='email']", "admin@example.com")
        page.fill("input[name='password']", "admin")
        page.click("button[type='submit']")
        expect(page).to_have_url("http://localhost:8000/admin/dashboard")
        print("   Success")

        # 2. Check Dashboard Stats
        expect(page.locator("h2")).to_contain_text("Dashboard")
        print("   Success")

        # 3. Add Batch
        print("3. Add Inventory Batch")
        page.fill("input[name='start_no']", "300")
        page.fill("input[name='end_no']", "400")
        page.click("button:has-text('Add Batch')")
        expect(page.locator("body")).to_contain_text("300 - 400")
        print("   Success")

        # 4. View Members
        print("4. View Members")
        page.click("text=Members") # Link in header
        expect(page).to_have_url("http://localhost:8000/admin/members")
        expect(page.locator("table")).to_be_visible()
        print("   Success")

        # 5. Member Detail
        print("5. Member Detail")
        # Click first Manage link. Use nth=0 to ensure we pick one if multiple.
        # Check if any rows exist first
        count = page.locator("a:has-text('Manage')").count()
        if count > 0:
            print(f"   Found {count} members.")
            page.locator("a:has-text('Manage')").nth(0).click()
            # Wait for navigation
            page.wait_for_load_state("networkidle")
            print(f"   Current URL: {page.url}")

            # Check for H2
            expect(page.locator("h2")).to_contain_text("Member:")
            print("   Success")
        else:
            print("   Skipped (No members found)")

    except Exception as e:
        print(f"Error: {e}")
        print("Page Content:")
        print(page.content())
        raise e
    finally:
        browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
