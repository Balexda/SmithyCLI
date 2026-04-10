#!/usr/bin/env node

/**
 * CLI wrapper around parse-stream.mjs utilities.
 *
 * Usage:
 *   node evals/spike/extract.mjs <command> <file>
 *
 * Commands:
 *   text       Extract all assistant text content
 *   result     Extract the final result text
 *   tools      List all tool uses (name and count)
 *   agents     Show sub-agent dispatches and their results
 *   summary    Print a summary of the run
 *   check-a    Check Assumption A (skill loading)
 *   check-b    Check Assumption B (sub-agent dispatch)
 *   check-c    Check Assumption C (stdout capture)
 */

import {
  parseStreamFile,
  extractText,
  extractResult,
  extractToolUses,
  extractSubAgentDispatches,
  summarizeEvents,
} from "./parse-stream.mjs";

const [command, filePath] = process.argv.slice(2);

if (!command || !filePath) {
  console.error("Usage: node extract.mjs <command> <file>");
  console.error(
    "Commands: text, result, tools, agents, summary, check-a, check-b, check-c"
  );
  process.exit(1);
}

const events = await parseStreamFile(filePath);

switch (command) {
  case "text": {
    console.log(extractText(events));
    break;
  }

  case "result": {
    const result = extractResult(events);
    if (!result) {
      console.error("No result event found.");
      process.exit(1);
    }
    console.log(`Subtype: ${result.subtype}`);
    console.log(`Duration: ${(result.duration_ms / 1000).toFixed(1)}s`);
    console.log(`Turns: ${result.num_turns}`);
    console.log(`---`);
    console.log(result.text);
    break;
  }

  case "tools": {
    const tools = extractToolUses(events);
    const counts = {};
    for (const t of tools) {
      counts[t.name] = (counts[t.name] ?? 0) + 1;
    }
    for (const [name, count] of Object.entries(counts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${name}: ${count}`);
    }
    console.log(`\nTotal: ${tools.length} tool uses`);
    break;
  }

  case "agents": {
    const agents = extractSubAgentDispatches(events);
    if (agents.length === 0) {
      console.log("No sub-agent dispatches found.");
      break;
    }
    for (const agent of agents) {
      console.log(`--- Agent: ${agent.description} ---`);
      console.log(`Prompt: ${agent.prompt.slice(0, 200)}...`);
      console.log(
        `Result: ${agent.resultText ? agent.resultText.slice(0, 300) + "..." : "(no result)"}`
      );
      console.log();
    }
    break;
  }

  case "summary": {
    const summary = summarizeEvents(events);
    console.log("Event counts:");
    for (const [type, count] of Object.entries(summary.eventCounts)) {
      console.log(`  ${type}: ${count}`);
    }
    console.log(`\nTool uses: ${summary.toolUseCount}`);
    console.log(`Tool types: ${summary.toolNames.join(", ")}`);
    console.log(`Result: ${summary.resultSubtype}`);
    console.log(`Duration: ${(summary.durationMs / 1000).toFixed(1)}s`);
    console.log(`Turns: ${summary.numTurns}`);
    console.log(`Text length: ${summary.textLength} chars`);
    break;
  }

  case "check-a": {
    console.log("=== Assumption A: Skill Loading ===\n");
    const text = extractText(events);
    const result = extractResult(events);
    const fullText = text + "\n" + (result?.text ?? "");
    const checks = [
      {
        name: "Structural sections (## Summary/Approach/Risks/Tasks)",
        pass: /## (Summary|Approach|Risks|Tasks|Requirements)/.test(fullText),
      },
      {
        name: "Phase markers (**Phase N:**)",
        pass: /\*\*Phase \d/.test(fullText),
      },
      {
        name: 'No generic refusal ("I\'d be happy to help")',
        pass: !/I'd be happy to help/i.test(fullText),
      },
      {
        name: 'No generic refusal ("Sure, here\'s")',
        pass: !/Sure, here's/i.test(fullText),
      },
    ];
    let allPass = true;
    for (const check of checks) {
      const status = check.pass ? "PASS" : "FAIL";
      console.log(`  ${status}: ${check.name}`);
      if (!check.pass) allPass = false;
    }
    console.log(`\nAssumption A: ${allPass ? "PASS" : "FAIL"}`);
    process.exit(allPass ? 0 : 1);
  }

  case "check-b": {
    console.log("=== Assumption B: Sub-Agent Dispatch ===\n");
    const text = extractText(events);
    const result = extractResult(events);
    const fullText = text + "\n" + (result?.text ?? "");
    const agents = extractSubAgentDispatches(events);
    const checks = [
      {
        name: "smithy-plan (lens labels)",
        pass: /Simplification|Separation of Concerns|Robustness/.test(
          fullText
        ),
      },
      {
        name: "smithy-reconcile (reconciliation markers)",
        pass: /reconcil|merged|\[via/i.test(fullText),
      },
      {
        name: "smithy-clarify (clarification markers)",
        pass: /clarif|assumption/i.test(fullText),
      },
    ];
    let allPass = true;
    for (const check of checks) {
      const status = check.pass ? "PASS" : "FAIL";
      console.log(`  ${status}: ${check.name}`);
      if (!check.pass) allPass = false;
    }
    // Scout is expected absent
    const scoutFound = /[Ss]cout|consistency/i.test(fullText);
    console.log(
      `  ${scoutFound ? "NOTE" : "EXPECTED-ABSENT"}: smithy-scout (strike does not dispatch scout)`
    );

    console.log(`\n  Agent tool dispatches: ${agents.length}`);
    for (const a of agents) {
      console.log(`    - ${a.description}`);
    }

    console.log(`\nAssumption B: ${allPass ? "PASS" : "FAIL"}`);
    process.exit(allPass ? 0 : 1);
  }

  case "check-c": {
    console.log("=== Assumption C: Stdout Capture ===\n");
    const text = extractText(events);
    const result = extractResult(events);
    const checks = [
      { name: "Text content non-empty", pass: text.length > 0 },
      { name: "Contains Markdown headings", pass: /^#/m.test(text) },
      { name: "Result event present", pass: result !== null },
      {
        name: "Result is success",
        pass: result?.subtype === "success",
      },
    ];
    let allPass = true;
    for (const check of checks) {
      const status = check.pass ? "PASS" : "FAIL";
      console.log(`  ${status}: ${check.name}`);
      if (!check.pass) allPass = false;
    }
    console.log(`\n  Text length: ${text.length} chars`);
    console.log(`  Duration: ${((result?.duration_ms ?? 0) / 1000).toFixed(1)}s`);

    console.log(`\nAssumption C: ${allPass ? "PASS" : "FAIL"}`);
    process.exit(allPass ? 0 : 1);
  }

  default:
    console.error(`Unknown command: ${command}`);
    console.error(
      "Commands: text, result, tools, agents, summary, check-a, check-b, check-c"
    );
    process.exit(1);
}
