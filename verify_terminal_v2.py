import asyncio
from playwright.async_api import async_playwright
import os

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Increase timeout for slow starts
        page.set_default_timeout(30000)

        print("Navigating to http://localhost:3000...")
        await page.goto("http://localhost:3000")

        # Wait for the canvas to appear
        print("Waiting for canvas...")
        await page.wait_for_selector("#terminal-canvas-texture")

        # Wait a bit for the backend to connect and send initial prompt
        print("Waiting for terminal content...")

        # We can check if the canvas changed from the placeholder
        # Or just wait a fixed amount of time since it's hard to read canvas content directly easily here
        await asyncio.sleep(5)

        # Take a screenshot
        os.makedirs("verification/screenshots", exist_ok=True)
        screenshot_path = "verification/screenshots/verification_v2.png"
        await page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        # Try to type something to see if it responds
        print("Typing 'ls -l'...")
        await page.focus(".vr-shell")
        await page.keyboard.type("ls -l\n")
        await asyncio.sleep(2)

        await page.screenshot(path="verification/screenshots/verification_after_ls.png")
        print("Final screenshot saved.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify())
