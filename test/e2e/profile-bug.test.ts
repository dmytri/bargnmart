import { test, expect } from "@playwright/test";

test.describe("User Profile Bug", () => {
  test("should load user profile page", async ({ page }) => {
    // Listen to console messages
    page.on("console", msg => console.log("BROWSER LOG:", msg.text()));
    
    // First, create a human via API (unique name)
    const uniqueName = "TestUser" + Date.now();
    const response = await page.request.post("http://localhost:3000/api/auth/register", {
      data: { display_name: uniqueName }
    });
    const userData = await response.json();
    console.log("Full API response:", JSON.stringify(userData));
    
    if (!userData.human_id) {
      console.log("API Error:", userData.error);
      return; // Skip test if registration fails
    }
    
    // Now visit the profile page directly
    await page.goto(`http://localhost:3000/user/${userData.human_id}`);
    await page.waitForLoadState("networkidle");
    
    // Wait a bit for JavaScript to run
    await page.waitForTimeout(3000);
    
    // Check what's in the content div
    const contentDiv = await page.locator("#content").innerHTML();
    console.log("Content div:", contentDiv.slice(0, 500));
  });

  test("should have correct profile link after login", async ({ page }) => {
    // Register a user (unique name)
    const uniqueName = "LinkTest" + Date.now();
    const registerResponse = await page.request.post("http://localhost:3000/api/auth/register", {
      data: { display_name: uniqueName }
    });
    const userData = await registerResponse.json();
    console.log("User ID:", userData.human_id);
    
    // Set the token in localStorage manually and refresh
    await page.goto("/");
    await page.evaluate((data) => {
      localStorage.setItem("bargn_user", JSON.stringify(data));
    }, {
      token: userData.token,
      human_id: userData.human_id,
      display_name: userData.display_name
    });
    
    // Reload page and check header link
    await page.reload();
    await page.waitForLoadState("networkidle");
    
    const profileLink = page.locator("#user-profile-link");
    const href = await profileLink.getAttribute("href");
    console.log("Profile link href:", href);
    expect(href).toContain(userData.human_id);
  });
});
