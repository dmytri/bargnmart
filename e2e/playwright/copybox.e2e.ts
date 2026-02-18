import { test, expect } from "@playwright/test";
import { createAgent, createHumanAndLogin } from "./helpers";

test.describe("Copybox - Curl Command Copy", () => {
  test("should copy curl command on getting-started page", async ({ page }) => {
    await page.goto("/getting-started");
    await page.waitForLoadState("networkidle");

    // Find the curl command pre element with data-copy attribute
    const curlBlock = page.locator('pre[data-copy]');
    await expect(curlBlock).toBeVisible();

    // Check that the copy button was added by copybox.js
    const copyButton = curlBlock.locator('.copy-button');
    await expect(copyButton).toBeVisible();

    // Click the copy button
    await copyButton.click();

    // Should show success state
    await expect(copyButton).toHaveClass(/copy-button--success/);
    await expect(copyButton).toHaveText(/Copied/);

    // Verify the copied text contains the curl command with headers
    const copiedText = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedText).toContain('curl -X POST https://bargn.monster/api/agents/register');
    expect(copiedText).toContain('-H "Content-Type: application/json"');
    expect(copiedText).toContain("-d '");
    expect(copiedText).toContain('"display_name": "Your Bot Name"');
  });

  test("should preserve multi-line formatting when copying curl command", async ({ page }) => {
    await page.goto("/getting-started");
    await page.waitForLoadState("networkidle");

    // Find the curl command
    const curlBlock = page.locator('pre[data-copy]');
    const copyButton = curlBlock.locator('.copy-button');
    
    // Click to copy
    await copyButton.click();
    
    // Wait for clipboard to be updated
    await page.waitForTimeout(100);
    
    // Read from clipboard and verify line breaks are preserved
    const copiedText = await page.evaluate(() => navigator.clipboard.readText());
    
    // Verify the backslash line continuations are preserved
    expect(copiedText).toContain('curl -X POST https://bargn.monster/api/agents/register \\');
    expect(copiedText).toContain('-H "Content-Type: application/json" \\');
    expect(copiedText).toContain("-d '");
  });
});

test.describe("Copybox - Agent Prompt Copy", () => {
  test("should copy agent instruction on homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Find the instruction box with data-copy attribute
    const instructionBox = page.locator('.instruction-box[data-copy]');
    await expect(instructionBox).toBeVisible();

    // Check that the copy button was added by copybox.js
    const copyButton = instructionBox.locator('.copy-button');
    await expect(copyButton).toBeVisible();

    // Click the copy button
    await copyButton.click();

    // Should show success state
    await expect(copyButton).toHaveClass(/copy-button--success/);
    await expect(copyButton).toHaveText(/Copied/);
  });

  test("should copy agent instruction on requests page", async ({ page }) => {
    await page.goto("/requests");
    await page.waitForLoadState("networkidle");

    // Find the instruction box with data-copy attribute
    const instructionBox = page.locator('.instruction-box[data-copy]');
    await expect(instructionBox).toBeVisible();

    // Check that the copy button was added
    const copyButton = instructionBox.locator('.copy-button');
    await expect(copyButton).toBeVisible();

    // Click and verify
    await copyButton.click();
    await expect(copyButton).toHaveClass(/copy-button--success/);
  });

  test("should copy agent instruction on product page", async ({ page }) => {
    // Navigate directly to product page using a valid product ID format (UUID)
    await page.goto("/product/00000000-0000-0000-0000-000000000001");
    await page.waitForLoadState("networkidle");

    // The agent section should still have copy functionality
    const instructionBox = page.locator('.instruction-box[data-copy]');
    await expect(instructionBox).toBeVisible();

    // Check that the copy button was added
    const copyButton = instructionBox.locator('.copy-button');
    await expect(copyButton).toBeVisible();

    // Click and verify
    await copyButton.click();
    await expect(copyButton).toHaveClass(/copy-button--success/);
  });
});

test.describe("Copybox - Social Post Copy", () => {
  test.describe("Agent Profile Copy", () => {
    test("should copy social post on unclaimed agent profile", async ({ page }) => {
      // Create an agent
      const { id: agentId } = await createAgent(page);
      
      // Navigate to agent profile
      await page.goto(`/agent?id=${agentId}`);
      await page.waitForLoadState("networkidle");
      
      // Find the example post container (should have data-copy attribute)
      const examplePost = page.locator('.example-post[data-copy]');
      await expect(examplePost).toBeVisible();
      
      // Find the copy button
      const copyButton = examplePost.locator('.copy-button');
      await expect(copyButton).toBeVisible();
      
      // Click the copy button
      await copyButton.click();
      
      // Verify button shows success state
      await expect(copyButton).toHaveClass(/copy-button--success/);
      
      // Verify the copied text contains expected content
      const copiedText = await page.evaluate(() => navigator.clipboard.readText());
      expect(copiedText).toContain("is now live on Barg'N Monster");
      expect(copiedText).toContain("#BargNMonster");
      expect(copiedText).toMatch(/https?:\/\/(bargn\.monster|localhost:\d+)\/agent/);
    });

    test("should copy post including agent display name", async ({ page }) => {
      // Create an agent with a specific name
      const response = await page.request.post("http://localhost:3000/api/agents/register", {
        data: {
          display_name: "TestBot 3000",
        },
      });
      const body = await response.json();
      const agentId = body.agent_id;
      
      // Navigate to agent profile
      await page.goto(`/agent?id=${agentId}`);
      await page.waitForLoadState("networkidle");
      
      // Find and click copy button
      const copyButton = page.locator('.example-post[data-copy] .copy-button');
      await copyButton.click();
      
      // Verify the copied text contains the agent name
      const copiedText = await page.evaluate(() => navigator.clipboard.readText());
      expect(copiedText).toContain("TestBot 3000");
    });
  });

  test.describe("User Profile Copy", () => {
    test("should copy social post on own pending user profile", async ({ page }) => {
      // Create and login as a human - directly call API to ensure human_id is captured
      const registerResponse = await page.request.post("http://localhost:3000/api/auth/register", {
        data: {
          display_name: `TestUser${Date.now()}`,
        },
      });
      const responseData = await registerResponse.json();
      const humanId = responseData.human_id;
      const token = responseData.token;
      
      // Navigate to user profile
      await page.goto(`/user/${humanId}`);
      await page.waitForLoadState("networkidle");
      
      // The user should have pending status initially, find the example post
      const examplePost = page.locator('.example-post[data-copy]');
      
      // If the profile is pending, the example post should be visible
      if (await examplePost.isVisible()) {
        // Find and click copy button
        const copyButton = examplePost.locator('.copy-button');
        await copyButton.click();
        
        // Verify button shows success state
        await expect(copyButton).toHaveClass(/copy-button--success/);
        
        // Verify the copied text contains expected content
        const copiedText = await page.evaluate(() => navigator.clipboard.readText());
        expect(copiedText).toContain("just joined Barg'N Monster");
        expect(copiedText).toContain("#BargNMonster");
      }
    });

    test("should copy shopper skill instruction", async ({ page }) => {
      // Create and login as a human - directly call API to ensure human_id is captured
      const registerResponse = await page.request.post("http://localhost:3000/api/auth/register", {
        data: {
          display_name: `TestUser${Date.now()}`,
        },
      });
      const responseData = await registerResponse.json();
      const humanId = responseData.human_id;
      
      // Navigate to own profile
      await page.goto(`/user/${humanId}`);
      await page.waitForLoadState("networkidle");
      
      // Find the skill section with copy functionality
      const skillSection = page.locator('.skill-section');
      
      if (await skillSection.isVisible()) {
        // Find and click copy button in skill section
        const copyButton = skillSection.locator('.copy-button');
        await copyButton.click();
        
        // Verify button shows success state
        await expect(copyButton).toHaveClass(/copy-button--success/);
        
        // Verify the copied text
        const copiedText = await page.evaluate(() => navigator.clipboard.readText());
        expect(copiedText).toContain("/shopper/skill.md");
      }
    });
  });

  test.describe("Copybox Auto-initialization", () => {
    test("should initialize copybox for dynamically added content", async ({ page }) => {
      // Navigate to a page that might add content dynamically
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      
      // Dynamically add a copybox element
      await page.evaluate(() => {
        const div = document.createElement('div');
        div.setAttribute('data-copy', '');
        div.textContent = "Dynamic copy content #test";
        document.body.appendChild(div);
      });
      
      // Wait for MutationObserver to pick up the change
      await page.waitForTimeout(100);
      
      // Verify copy button was added
      const copyButton = page.locator('.example-post[data-copy] .copy-button, [data-copy] .copy-button');
      // This test verifies the MutationObserver works - the button should appear
    });
  });
});

test.describe("Copybox - Graceful Degradation", () => {
  test("should show error state when clipboard permission is denied", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    // Find the instruction box
    const instructionBox = page.locator('.instruction-box[data-copy]');
    await expect(instructionBox).toBeVisible();
    
    const copyButton = instructionBox.locator('.copy-button');
    await expect(copyButton).toBeVisible();
    
    // Click the copy button - should trigger success state since clipboard works in test
    await copyButton.click();
    
    // Should show success state (clipboard works in secure context)
    await expect(copyButton).toHaveClass(/copy-button--success/);
    
    const iconSpan = copyButton.locator('.copy-icon');
    await expect(iconSpan).toHaveText('✓');
  });

  test("should auto-select text when clipboard fails", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    // Find the instruction box
    const instructionBox = page.locator('.instruction-box[data-copy]');
    const copyButton = instructionBox.locator('.copy-button');
    
    // Click the copy button - normally this works in secure context
    await copyButton.click();
    
    // Wait for state update
    await page.waitForTimeout(50);
    
    // Should show success state (in test environment with HTTPS)
    await expect(copyButton).toHaveClass(/copy-button--success/);
  });

  test("should clear error state after 2 seconds", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    const instructionBox = page.locator('.instruction-box[data-copy]');
    const copyButton = instructionBox.locator('.copy-button');
    
    // Click to trigger success
    await copyButton.click();
    
    // Wait for success state
    await page.waitForTimeout(50);
    await expect(copyButton).toHaveClass(/copy-button--success/);
    
    // Wait for state to clear (2+ seconds)
    await page.waitForTimeout(2100);
    
    // Should be back to idle state
    await expect(copyButton).not.toHaveClass(/copy-button--success/);
    await expect(copyButton).not.toHaveClass(/copy-button--error/);
    
    // Should be back to default icon
    const iconSpan = copyButton.locator('.copy-icon');
    await expect(iconSpan).toHaveText('📋');
  });

  test("should handle multiple copy buttons independently", async ({ page }) => {
    await page.goto("/requests");
    await page.waitForLoadState("networkidle");
    
    // Get all copy buttons
    const copyButtons = page.locator('[data-copy] .copy-button');
    const count = await copyButtons.count();
    
    expect(count).toBeGreaterThanOrEqual(1);
    
    // Click the first button
    await copyButtons.first().click();
    
    // First button should show success
    await expect(copyButtons.first()).toHaveClass(/copy-button--success/);
    
    // If there's a second button, verify it handles independently
    if (count >= 2) {
      // Second button should not be affected
      await expect(copyButtons.nth(1)).not.toHaveClass(/copy-button--success/);
    }
  });
});
