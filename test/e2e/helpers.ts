import { type Page, type Locator, expect } from "@playwright/test";

export class BasePage {
  readonly page: Page;
  readonly url: string;

  constructor(page: Page, url = "/") {
    this.page = page;
    this.url = url;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState("networkidle");
  }
}

export class BargnPage extends BasePage {
  readonly header: Locator;
  readonly nav: Locator;
  readonly flashMessages: Locator;

  constructor(page: Page) {
    super(page, "/");
    this.header = page.locator("header");
    this.nav = page.locator("nav");
    this.flashMessages = page.locator(".flash, .alert, [data-testid='flash']");
  }

  async getFlashMessage(): Promise<string | null> {
    return this.flashMessages.first().textContent().catch(() => null);
  }

  async waitForFlash(message: string): Promise<void> {
    await expect(this.flashMessages.filter({ hasText: message })).toBeVisible();
  }
}

export class HomePage extends BargnPage {
  readonly title: Locator;
  readonly tagline: Locator;
  readonly ctaButton: Locator;
  readonly requestsList: Locator;

  constructor(page: Page) {
    super(page);
    this.url = "/";
    this.title = page.locator("h1");
    this.tagline = page.locator("p:has-text('sketchy')");
    this.ctaButton = page.getByRole("link", { name: /sell/i });
    this.requestsList = page.locator("[data-testid='requests']");
  }

  async getRequestTexts(): Promise<string[]> {
    return this.requestsList.locator(".request-text, [data-testid='request-text']").allTextContents();
  }
}

export class RequestFormPage extends BargnPage {
  readonly form: Locator;
  readonly textInput: Locator;
  readonly budgetInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page, "/requests/new");
    this.form = page.locator("form");
    this.textInput = page.locator("input[name='text'], textarea[name='text']");
    this.budgetInput = page.locator("input[name='budget']");
    this.submitButton = page.getByRole("button", { name: /submit|post|create/i });
  }

  async submitRequest(text: string, budget?: number): Promise<void> {
    await this.textInput.fill(text);
    if (budget !== undefined) {
      await this.budgetInput.fill(budget.toString());
    }
    await this.submitButton.click();
  }
}

export async function createHumanAndLogin(page: Page): Promise<{ id: string; token: string }> {
  const response = await page.request.post("http://localhost:3000/api/humans/register", {
    data: {
      display_name: "Test Human",
    },
  });
  const body = await response.json();
  return { id: body.id, token: body.token };
}

export async function createAgent(page: Page): Promise<{ id: string; token: string }> {
  const response = await page.request.post("http://localhost:3000/api/agents/register", {
    data: {
      display_name: "Test Agent",
    },
  });
  const body = await response.json();
  return { id: body.agent_id, token: body.token };
}
