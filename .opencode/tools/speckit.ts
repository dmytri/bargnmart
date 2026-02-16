import { tool } from "@opencode-ai/plugin"
import { z } from "zod"

export default tool({
  description: "Run spec-kit workflows for specification-driven development. Use when:\n" +
    "- Starting a new feature: action='new'\n" +
    "- Checking current state: action='status' returns phase and available docs\n" +
    "- Verifying tools: action='check'\n" +
    "- Running tests: action='test'\n" +
    "- Syncing context: action='context'\n" +
    "Phase detection: Run 'status' to see available docs (spec.md, plan.md, tasks.md) and determine if you're in specify/plan/tasks/implement phase.\n" +
    "Tests are REQUIRED in all features - not optional.\n" +
    "Wraps: specify CLI + custom scripts in .specify/scripts/bash/",

  args: {
    action: z.enum([
      "init", "check", "new", "status", "test", "context"
    ]).describe("What to do"),
    feature: z.string().optional().describe("Feature name or branch"),
    testType: z.enum(["unit", "e2e", "all"]).optional().describe("Test type for 'test' action"),
  },

  async execute({ action, feature, testType }, context) {
    const { worktree } = context

    switch (action) {
      case "init": {
        const result = await Bun.$`specify init ${feature ?? "."}`.text()
        return { success: true, output: result }
      }

      case "check": {
        const result = await Bun.$`specify check`.text()
        return { success: true, output: result }
      }

      case "new": {
        if (!feature) {
          return { success: false, error: "feature name required" }
        }
        const result = await Bun.$`bash ${worktree}/.specify/scripts/bash/create-new-feature.sh ${feature}`.text()
        return { success: true, output: result }
      }

      case "status": {
        const result = await Bun.$`bash ${worktree}/.specify/scripts/bash/check-prerequisites.sh --json --skip-branch-check --include-tasks`.text()
        try {
          const parsed = JSON.parse(result)
          
          let phase = "unknown"
          const docs = parsed.AVAILABLE_DOCS || []
          
          if (docs.includes("spec.md") && docs.includes("plan.md") && docs.includes("tasks.md")) {
            phase = "implement"
          } else if (docs.includes("spec.md") && docs.includes("plan.md")) {
            phase = "tasks"
          } else if (docs.includes("spec.md")) {
            phase = "plan"
          } else if (docs.length === 0 || docs.includes("spec.md")) {
            phase = "specify"
          }

          return {
            featureDir: parsed.FEATURE_DIR,
            branch: parsed.BRANCH,
            docs,
            phase,
            readyFor: getReadyFor(docs)
          }
        } catch {
          return { success: false, error: "Failed to parse status", raw: result }
        }
      }

      case "test": {
        const type = testType ?? "all"
        
        if (type === "unit" || type === "all") {
          const unitResult = await Bun.$`bun test`.text()
          if (type === "unit") return { success: true, output: unitResult, type: "unit" }
        }
        
        if (type === "e2e" || type === "all") {
          const e2eResult = await Bun.$`bun run test:e2e`.text()
          return { success: true, output: e2eResult, type: "e2e" }
        }
        
        return { success: true, output: "No tests requested" }
      }

      case "context": {
        const result = await Bun.$`bash ${worktree}/.specify/scripts/bash/update-agent-context.sh`.text()
        return { success: true, output: result }
      }

      default:
        return { success: false, error: `Unknown action: ${action}` }
    }
  }
})

function getReadyFor(docs: string[]): string[] {
  const ready: string[] = []
  if (docs.includes("spec.md")) ready.push("plan")
  if (docs.includes("plan.md")) ready.push("tasks")
  if (docs.includes("tasks.md")) ready.push("implement")
  return ready
}
