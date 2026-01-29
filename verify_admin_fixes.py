from playwright.sync_api import sync_playwright, expect
import os

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

        # 2. View Members
        print("2. View Members")
        page.click("text=Members")
        expect(page).to_have_url("http://localhost:8000/admin/members")
        print("   Success")

        # 3. Member Detail & Edit
        print("3. Member Detail & Edit")
        if page.locator("a:has-text('Manage')").count() > 0:
            page.locator("a:has-text('Manage')").nth(0).click()
            expect(page.locator("h2")).to_contain_text("Member:")

            # Test Edit
            old_name = page.locator("input[name='first_name']").input_value()
            new_name = old_name + "_Edited"
            page.fill("input[name='first_name']", new_name)
            page.click("button:has-text('Save Changes')")

            # Verify Edit
            expect(page.locator("h2")).to_contain_text(new_name)
            print("   Success")

            # Test Doc Download (Check link format)
            # We expect /admin/download/ID
            download_link = page.locator("a:has-text('Download')").nth(0)
            href = download_link.get_attribute("href")
            if "/admin/download/" in href:
                print(f"   Download link verified: {href}")
            else:
                raise Exception(f"Invalid download link: {href}")

        else:
            print("   Skipped (No members found)")

    except Exception as e:
        print(f"Error: {e}")
        # print(page.content())
        raise e
    finally:
        browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
