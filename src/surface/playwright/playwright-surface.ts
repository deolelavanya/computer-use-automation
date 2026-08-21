import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright";

import type {
  Action,
  Target,
  TargetStrategy,
} from "../../artifact/schema.js";

import type {
  ComputerSurface,
  EvidenceRef,
  ResolvedTarget,
  SurfaceActionResult,
  SurfaceObservation,
  SurfaceSession,
} from "../surface.js";

type HandleRecord = {
  locator: Locator;
  strategyIndex: number;
  strategyType: TargetStrategy["type"];
};

export class PlaywrightSurface
  implements ComputerSurface
{
  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly session: SurfaceSession,
  ) {}

  private readonly handles =
    new Map<string, HandleRecord>();

  private handleCounter = 0;
  private evidenceCounter = 0;

  static async launch(
    startUrl: string,
  ): Promise<PlaywrightSurface> {
    const browser =
      await chromium.launch({
        headless: false,
      });

    const context =
      await browser.newContext();

    const page =
      await context.newPage();

    await page.goto(startUrl, {
      waitUntil: "domcontentloaded",
    });

    return new PlaywrightSurface(
      browser,
      context,
      page,
      {
        id: `pw-${Date.now()}`,
      },
    );
  }

  async observe(): Promise<SurfaceObservation> {
    const title =
      await this.page.title();

    const visibleText =
      await this.page
        .locator("body")
        .innerText();

    return {
      url: this.page.url(),
      title,
      visibleText,
    };
  }

  async waitForText(
    text: string,
    timeoutMs = 5000,
  ): Promise<boolean> {
    try {
      await this.page
        .getByText(text, {
          exact: false,
        })
        .first()
        .waitFor({
          state: "visible",
          timeout: timeoutMs,
        });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract visible text from a previously resolved target.
   */
  async getText(
    target: ResolvedTarget,
  ): Promise<string> {
    const record =
      this.handles.get(
        target.handle,
      );

    if (!record) {
      throw new Error(
        `INVALID_TARGET_HANDLE: ${target.handle}`,
      );
    }

    const text =
      await record.locator.innerText();

    return text.trim();
  }

  async resolveTarget(
    target: Target,
  ): Promise<ResolvedTarget> {
    for (
      let strategyIndex = 0;
      strategyIndex <
      target.strategies.length;
      strategyIndex += 1
    ) {
      const strategy =
        target.strategies[
          strategyIndex
        ];

      const locator =
        this.locatorForStrategy(
          strategy,
        );

      /**
       * A previous action may trigger navigation or legacy
       * application rendering.
       *
       * Give each target strategy a short opportunity to become
       * visible before deciding that the strategy does not match.
       */
      try {
        await locator
          .first()
          .waitFor({
            state: "visible",
            timeout: 2000,
          });
      } catch {
        continue;
      }

      const count =
        await locator.count();

      if (count === 0) {
        continue;
      }

      if (count > 1) {
        throw new Error(
          `AMBIGUOUS_TARGET: strategy ${strategyIndex} ` +
            `(${strategy.type}) matched ${count} elements`,
        );
      }

      const handle =
        `target-${++this.handleCounter}`;

      this.handles.set(
        handle,
        {
          locator,
          strategyIndex,
          strategyType:
            strategy.type,
        },
      );

      return {
        handle,
        strategyIndex,
        strategyType:
          strategy.type,
      };
    }

    throw new Error(
      "TARGET_NOT_FOUND",
    );
  }

  async act(
    action: Action,
    target: ResolvedTarget,
  ): Promise<SurfaceActionResult> {
    const startedAt =
      Date.now();

    const record =
      this.handles.get(
        target.handle,
      );

    if (!record) {
      return {
        success: false,

        durationMs:
          Date.now() -
          startedAt,

        error: {
          code:
            "INVALID_TARGET_HANDLE",

          message:
            `Unknown target handle: ${target.handle}`,
        },
      };
    }

    try {
      switch (action.type) {
        case "fill":
          await record.locator.fill(
            action.value,
          );

          break;

        case "click":
          await record.locator.click();

          break;

        case "select": {
          /**
           * Deterministic artifacts normally store the underlying
           * HTML option value.
           *
           * Example:
           *
           *   SAVINGS
           *
           * During discovery, however, an LLM may observe the
           * human-readable option label instead.
           *
           * Example:
           *
           *   REGULAR SAVINGS
           *
           * Support both representations without encoding
           * application-specific product knowledge into the
           * discovery model.
           */
          try {
            await record.locator
              .selectOption({
                value:
                  action.value,
              });
          } catch {
            await record.locator
              .selectOption({
                label:
                  action.value,
              });
          }

          break;
        }

        case "assert_text": {
          const actual = (
            await record.locator
              .innerText()
          ).trim();

          if (
            !actual.includes(
              action.expected,
            )
          ) {
            return {
              success: false,

              durationMs:
                Date.now() -
                startedAt,

              resolvedTarget:
                target,

              error: {
                code:
                  "ASSERT_TEXT_FAILED",

                message:
                  `Expected target text to contain ` +
                  `"${action.expected}", but observed ` +
                  `"${actual}".`,
              },
            };
          }

          break;
        }
      }

      return {
        success: true,

        durationMs:
          Date.now() -
          startedAt,

        resolvedTarget:
          target,
      };
    } catch (error) {
      return {
        success: false,

        durationMs:
          Date.now() -
          startedAt,

        resolvedTarget:
          target,

        error: {
          code:
            "SURFACE_ACTION_FAILED",

          message:
            error instanceof Error
              ? error.message
              : String(error),
        },
      };
    }
  }

  async captureEvidence(
    type: EvidenceRef["type"],
  ): Promise<EvidenceRef> {
    this.evidenceCounter += 1;

    switch (type) {
      case "screenshot": {
        const path =
          `evidence/runtime/` +
          `${this.session.id}-` +
          `${String(
            this.evidenceCounter,
          ).padStart(
            3,
            "0",
          )}.png`;

        await this.page.screenshot({
          path,
          fullPage: true,
        });

        return {
          type,
          path,
        };
      }

      case "dom_snapshot": {
        const path =
          `evidence/runtime/` +
          `${this.session.id}-` +
          `${String(
            this.evidenceCounter,
          ).padStart(
            3,
            "0",
          )}.html`;

        const html =
          await this.page.content();

        const fs =
          await import(
            "node:fs/promises"
          );

        await fs.mkdir(
          "evidence/runtime",
          {
            recursive: true,
          },
        );

        await fs.writeFile(
          path,
          html,
          "utf8",
        );

        return {
          type,
          path,
        };
      }

      case "trace":
        throw new Error(
          "TRACE_CAPTURE_NOT_IMPLEMENTED_YET",
        );
    }
  }

  getSession(): SurfaceSession {
    return this.session;
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private locatorForStrategy(
    strategy: TargetStrategy,
  ): Locator {
    switch (strategy.type) {
      case "role":
        return this.page.getByRole(
          strategy.role as never,
          {
            name:
              strategy.name,
            exact: true,
          },
        );

      case "label":
        return this.page.getByLabel(
          strategy.value,
          {
            exact: true,
          },
        );

      case "text":
        return this.page.getByText(
          strategy.value,
          {
            exact: true,
          },
        );

      case "attribute":
        return this.page.locator(
          `[${strategy.name}="${strategy.value}"]`,
        );

      case "near_text":
        return this.page
          .getByText(
            strategy.value,
            {
              exact: true,
            },
          )
          .locator(
            "xpath=following::*[1]",
          );
    }
  }
}