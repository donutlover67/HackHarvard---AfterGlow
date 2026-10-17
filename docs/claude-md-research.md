# Write less CLAUDE.md, enforce more

A 4-person hackathon team gets the most from Claude Code with a **short, hand-written root CLAUDE.md of roughly 40–80 lines**. It should hold the exact commands Claude cannot guess, the scope and source-of-truth order, file-ownership boundaries, and a "things that will bite you" list. Each work area (e.g. `firmware/`, `dashboard/`) gets its own small CLAUDE.md. Every rule that must never be broken (no interactive serial monitors, no edits to the shared protocol, no pushes, no lockfile churn) is backed by a committed `.claude/settings.json` permission rule or hook, because Anthropic's own docs call CLAUDE.md "context, not enforced configuration" ([Memory docs](https://code.claude.com/docs/en/memory)). The official ceiling is **under 200 lines per file**. Practitioners go shorter, and the best-regarded public files measure 58–157 lines ([Best practices](https://code.claude.com/docs/en/best-practices); [HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)). The strongest controlled evidence says two things. Human-written context files help modestly (about +4% task success) while LLM-generated ones slightly hurt and cost 20%+ more tokens. Adherence decays *within a session* more than it depends on file size ([DAIR.AI summary of ETH study](https://academy.dair.ai/blog/agents-md-evaluation); [arXiv 2605.10039](https://arxiv.org/abs/2605.10039)). So the levers that matter most in a 40-hour sprint sit partly outside the file: short sessions, `/clear` between tasks, hooks, permissions, and a committed contract file that both sides test against. For ESP32 work, the file must state hardware facts Claude would otherwise hallucinate: exact board, pinned core version, pin map, and arduino-esp32 3.x API names. It must also route all serial I/O through a bounded capture script, because interactive monitors have repeatedly hung Claude Code sessions ([#23745](https://claudeissues.com/issue/23745-bug-cli-freezes-on-serial-port-monitoring-commands-with-espflash-monitor); [#7607](https://claudeissues.com/issue/7607-bug-claude-code-automatically-opens-and-gets-stuck-reading-from-dev-ttyacm-devic)).

**How to read this report.** Claims are tagged **[Official]** (Anthropic docs at code.claude.com or platform.claude.com, current as of October 2026), **[First-hand]** (a named person reporting their own experience in a blog, forum post, GitHub issue or Anthropic winner profile), **[Research]** (arXiv studies), or **[Inference]** (synthesis by the research team, not directly observed). **Reddit could not be searched**: the search tool blocked reddit.com and the Reddit JSON API failed, so r/ClaudeAI, r/ClaudeCode, r/esp32 and r/embedded sentiment is absent. The only Reddit-derived item is a low-reliability mirror. Hacker News coverage rests mainly on one large thread about CLAUDE.md writing ([HN 46098838](https://news.ycombinator.com/item?id=46098838)) and the Embedder launch thread. **No first-hand write-up of a 4-person team using Claude Code at a hackathon was found**, so the team-coordination advice is extrapolated from official docs and from 2–3 person or multi-agent reports.

## Sixty lines that answer "how do I run this?" beat 400 lines of rules

### Length: under 200 is the ceiling, 40–80 is the hackathon target

**[Official]** Anthropic's guidance is to "target under 200 lines per CLAUDE.md file", because "longer files consume more context and reduce adherence". `@imports` help organization but "don't reduce its context cost", since imported files also load at launch ([Memory docs](https://code.claude.com/docs/en/memory)). The best-practices page names "the over-specified CLAUDE.md" as a failure pattern in which Claude "ignores half of it". Its diagnostic is blunt: if Claude keeps breaking a rule, "the file is probably too long and the rule is getting lost" ([Best practices](https://code.claude.com/docs/en/best-practices)).

**[First-hand]** Practitioners go shorter. HumanLayer's own root file is "less than sixty lines", and they report a community consensus of "< 300 lines" ([HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)). Files measured directly on 2026-10-16 were:

| Repo | Lines |
|---|---|
| anthropics/claude-code-action | **58** |
| humanlayer/humanlayer | 88 |
| supabase/supabase | 75 |
| getsentry/sentry | 129 |
| cloudflare/workers-sdk | 157 |
| anthropics/anthropic-sdk-python | 368 (outlier: even Anthropic repos exceed the guidance) |

Sources: [claude-code-action](https://github.com/anthropics/claude-code-action/blob/main/CLAUDE.md), [anthropic-sdk-python](https://github.com/anthropics/anthropic-sdk-python/blob/main/CLAUDE.md). On HN, one user argued the file should hold only reminders "useful in 100% of your sessions" ([HN](https://news.ycombinator.com/item?id=46098838)). One GitHub reporter's file was about 400 lines, and they saw MUST/ALWAYS/NEVER directives ignored in roughly half of sessions ([#17530](https://github.com/anthropics/claude-code/issues/17530)).

**[Research]** The steelman against "short files are followed better" deserves a hearing. A 2026 factorial study of 1,650 Claude Code sessions found **no detectable effect of file size, instruction position or contradictions in adjacent files on adherence**. The largest effect was within-session drift: **about 5.6% lower odds of compliance for each additional function generated** ([arXiv 2605.10039](https://arxiv.org/abs/2605.10039)).

**[Inference]** Our reading is that "long files get ignored" is mostly a symptom of long sessions and vague or rarely relevant rules. Brevity still pays for itself because every line costs tokens in every session of every teammate. For a hackathon repo, aim for 40–80 lines at the root and 20–60 lines per area file.

### Content: write for the gap, not the overview

**[Official]** The include list is short:

- Bash commands Claude can't guess
- style that differs from defaults
- test runners
- branch and PR etiquette
- architecture decisions
- required environment variables
- non-obvious gotchas

The exclude list is equally clear:

- anything inferable from code
- standard conventions
- detailed API docs (link instead)
- frequently changing information
- tutorials
- file-by-file descriptions
- platitudes like "write clean code"

Rules should be concrete and checkable ("Run `npm test` before committing", not "Test your changes") ([Best practices](https://code.claude.com/docs/en/best-practices); [Memory docs](https://code.claude.com/docs/en/memory)).

**[Research]** The ETH Zurich study backs this up. Codebase overviews appeared in every LLM-generated file and did not reduce the steps needed to find relevant files, and files restating the README were "probably hurting more than helping". Naming a specific tool did change behavior: mentioning `uv` raised its use from under 0.01 to 1.6 times per task ([DAIR.AI summary](https://academy.dair.ai/blog/agents-md-evaluation); [arXiv 2602.11988](https://arxiv.org/abs/2602.11988)). The same study is the main argument against shipping raw `/init` output. **LLM-generated files lowered success by 0.5–2% and raised cost by over 20%, while developer-written files raised success by about 4%** ([DAIR.AI](https://academy.dair.ai/blog/agents-md-evaluation)). Official docs still suggest `/init` as a starting point, so use it as a draft and then delete most of what it writes.

**[First-hand]** The strongest public examples are command-first and gotcha-heavy. claude-code-action's 58-line file is organized as Commands / What This Is / How It Runs / Key Concepts / "Things That Will Bite You" / Conventions ([claude-code-action](https://github.com/anthropics/claude-code-action/blob/main/CLAUDE.md)). Shrivu Shankar's advice is "Start with Guardrails, Not a Manual": document what Claude gets wrong, and wrap a complex CLI in a script instead of explaining it ([sshh.io](https://blog.sshh.io/p/how-i-use-every-claude-code-feature)). HumanLayer adds: "Don't make an LLM do a linter's job", and prefer `file:line` pointers over pasted snippets, which go stale ([HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)).

**[Inference]** For a hackathon, the skeleton is:

1. a two-line purpose and demo goal
2. the source-of-truth order
3. a layout-and-owners table
4. exact commands
5. working rules with reasons
6. gotchas
7. one "when compacting, preserve…" line

**[Official]** That last line is officially suggested ([Best practices](https://code.claude.com/docs/en/best-practices)). Block-level HTML comments are stripped before injection, so maintainer notes cost nothing ([Memory docs](https://code.claude.com/docs/en/memory)).

## Rules stick when a hook enforces them and a reason explains them

**[Official]** The single most consistent message across sources is to move "must" rules out of prose. Anthropic says hooks "are deterministic and guarantee the action happens" while CLAUDE.md instructions are advisory. To block an action regardless of Claude's judgment, use a PreToolUse hook ([Best practices](https://code.claude.com/docs/en/best-practices); [Memory docs](https://code.claude.com/docs/en/memory)). Permission rules in `.claude/settings.json` do the same for edits and commands. Rules are evaluated deny, then ask, then allow. A hook that exits with code 2 blocks the call even when an allow rule would permit it ([Permissions docs](https://code.claude.com/docs/en/permissions); [Hooks guide](https://code.claude.com/docs/en/hooks-guide)).

**[First-hand]** Practitioners agree. On HN, one user called a git lint hook "the only reliable way" to get linting done ([HN](https://news.ycombinator.com/item?id=46098838)). Shrivu frames it as CLAUDE.md for "should-do" and hooks for "must-do". He prefers block-at-submit hooks (refuse `git commit` until tests have passed) over block-at-write hooks, because blocking mid-plan confuses the agent ([sshh.io](https://blog.sshh.io/p/how-i-use-every-claude-code-feature)).

**[First-hand]** The embedded world shows why prose alone fails. In issue #37792, a user's CLAUDE.md said to look things up rather than guess, yet Claude still stated wrong STM32 pin mappings with confidence ([#37792](https://claudeissues.com/issue/37792-quality-regression-claude-presents-guessed-information-as-verified-facts)).

**[Official]** Within the file, phrasing matters, but differently than it did in 2025. Anthropic now warns that Opus 4.5+ models are "more responsive to the system prompt". It says to "dial back any aggressive language" such as "CRITICAL: You MUST", because it can cause overtriggering ([Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)). The Claude Code docs allow "IMPORTANT" on a single line Claude keeps skipping, but note that "if you emphasize many lines, none of them stands out" ([Best practices](https://code.claude.com/docs/en/best-practices)).

**[Official] / [Research]** Give the reason for each rule. The prompting docs say motivation helps Claude deliver more targeted responses. A 2026 study of 247,694 instruction lifetimes found that agent instruction files grow +226% over their life. Recording a rationale for each instruction removed 99.3% of excess instructions in controlled tests ([arXiv 2608.11095](https://arxiv.org/abs/2608.11095)).

**[First-hand]** Shrivu adds: pair every "never X" with "prefer Y", because an agent that thinks it must use the forbidden option gets stuck ([sshh.io](https://blog.sshh.io/p/how-i-use-every-claude-code-feature)).

**[Official]** Session hygiene does the rest:

- The project-root CLAUDE.md is re-read from disk and re-injected after `/compact`.
- Nested CLAUDE.md files and `paths:` rules reload only when Claude touches matching files again.
- Instructions given only in conversation are lost at compaction ([Memory docs](https://code.claude.com/docs/en/memory)).
- After two failed corrections, `/clear` and re-prompt ([Best practices](https://code.claude.com/docs/en/best-practices)).
- `/doctor prompt-audit` (v2.1.283+) flags stale, contradictory or nonexistent-path instructions ([Memory docs](https://code.claude.com/docs/en/memory)).

**[First-hand]** Some HN users plant a "canary" rule, such as addressing the user by a silly name, so they notice when the file drops out of attention. Others worry it wastes attention ([HN](https://news.ycombinator.com/item?id=46098838)). It is optional and unproven.

**[Inference]** Given the 5.6%-per-function drift finding, the cheapest adherence upgrade for a hackathon team is one session per task, cleared between tasks.

## Nested files load lazily, imports load eagerly, and CLAUDE.local.md stays in one checkout

### How files load

**[Official]** All discovered memory files are **concatenated, not overridden**:

- Files in the launch directory and above load at launch, root first. Closer files are read last.
- Subdirectory CLAUDE.md files load only when Claude reads, writes or edits a file in that subdirectory. They don't appear in `/context` until then.
- `CLAUDE.local.md` is appended after `CLAUDE.md` at each level.
- When two instructions contradict, "Claude may pick one arbitrarily" ([Memory docs](https://code.claude.com/docs/en/memory)).

**[Official]** Anthropic's large-codebase guide recommends exactly the split a firmware/dashboard team needs. A root file holds universal rules and commit conventions. Per-area files hold that area's stack conventions, and "each directory's owner typically maintains its file" ([Large codebases docs](https://code.claude.com/docs/en/large-codebases)). Path-scoped rules in `.claude/rules/*.md` with `paths:` frontmatter are the alternative when one rule spans scattered paths. Malformed YAML in that frontmatter silently falls back to always-load. Skills are the official home for procedures that are only sometimes relevant ([Memory docs](https://code.claude.com/docs/en/memory); [Best practices](https://code.claude.com/docs/en/best-practices)).

**[First-hand]** The 2nd-place Elisa project at Anthropic's Opus 4.6 hackathon used "CLAUDE.md at every directory level as a system prompt for the codebase" plus a staleness table "so docs never rot". It sustained roughly 10k lines a day and allowed a full backend rewrite in one evening. The source is only a talk abstract, and the actual files weren't found ([Code w/ Claude session](https://claude.com/code-with-claude/session/sf-ext-coherence-at-claude-code-speed); [Anthropic winners](https://claude.com/blog/meet-the-winners-of-our-built-with-opus-4-6-claude-code-hackathon)).

### Imports

**[Official]** `@path` imports are relative to the importing file and recurse up to four hops. Imports inside backticks or code blocks are ignored. Imports outside the repo trigger a one-time approval dialog ([Memory docs](https://code.claude.com/docs/en/memory)).

**[First-hand]** Practitioners split on whether to import or point. Shrivu warns that @-importing a doc "bloats the context window by embedding the entire file on every run". He also says a bare path mention is often ignored. His fix is to pitch *when* to read it: "if you hit error X, see path/to/doc.md" ([sshh.io](https://blog.sshh.io/p/how-i-use-every-claude-code-feature)). Some HN users report Claude rarely reads referenced docs consistently ([HN](https://news.ycombinator.com/item?id=46098838)).

**[Inference]** For a small firmware/dashboard protocol that both sides must always respect, @-import it and accept the cost. For datasheets, the full pin-map doc or long specs, use "read X before doing Y" pointers.

### CLAUDE.local.md and AGENTS.md

**[Official]** `CLAUDE.local.md` is active in current docs and is meant to be gitignored. A July 2025 deprecation notice was later quietly removed ([Memory docs](https://code.claude.com/docs/en/memory); [#2950](https://github.com/anthropics/claude-code/issues/2950)). It has two traps:

- **It exists only in the worktree where you created it.** For personal notes that should follow you, use `~/.claude/CLAUDE.md` or an `@~/.claude/…` import.
- **It counts as "having a CLAUDE.md".** In a repo that relies on AGENTS.md, adding one silently stops AGENTS.md from loading for that person ([Memory docs](https://code.claude.com/docs/en/memory)).

**[Official]** Since v2.1.277, Claude Code reads AGENTS.md only when no CLAUDE.md exists. Large repos (sentry, supabase, workers-sdk) use a one-line `@AGENTS.md` CLAUDE.md so one file serves every agent ([Memory docs](https://code.claude.com/docs/en/memory); [sentry CLAUDE.md](https://github.com/getsentry/sentry/blob/master/CLAUDE.md)).

**[First-hand]** The 2nd-place Torq hackathon team hit this directly. Their author warned that AGENTS.md "is not working by default with CC" ([Torq Substack](https://inbarshirizly.substack.com/p/coming-soon)).

**[Inference]** If all four teammates use Claude Code, just use CLAUDE.md. Personal files should add preferences, never contradict team rules.

## Hackathon winners spent their CLAUDE.md on constraints, not style

### What winners' files contained

**[First-hand]** Few hackathon write-ups show their actual CLAUDE.md. The ones that do treat it as a constraint layer rather than a style guide. The Torq team (2nd place, 6-hour event) used it "as a constraint engine" to keep three parallel Claude instances aligned without re-prompting each. It held:

- a 100k-token cap per run
- a rule that all LLM calls go through a `TracedLLM` wrapper
- a plan format
- a **DO NOT MODIFY** list naming specific files

Mitigation for parallel conflicts was one file or folder per instance ([Torq Substack](https://inbarshirizly.substack.com/p/coming-soon)).

**[Template]** A public hackathon kit's CLAUDE.md is the most complete example (organizer template, not first-hand) ([hackathon-setup CLAUDE.md](https://raw.githubusercontent.com/rawadhossain/hackathon-setup/HEAD/CLAUDE.md)):

- It sets a precedence order: "Problem statement > Requirements > Architecture > Decisions > API contracts > Tasks > Implementation details". Agents must "stop and reconcile" conflicts and mark unknowns as UNKNOWN.
- It demands "the smallest complete, demonstrable vertical slice first".
- It allows mocks only "when their contract is recorded".
- It keeps a cut list.
- It rules: "Never claim a feature works without evidence."

**[Inference]** Style conventions almost never appear in first-hand accounts.

### Planning came first

**[First-hand]** The most consistent winning pattern is planning before code. At Anthropic's 5-day Opus 4.7 hackathon:

- Maieutic (3rd) spent two days on design and technical specs.
- ARIA spent day two in planning mode with milestones and acceptance criteria.
- Wrench Board (2nd) split the app into four areas, each with its own spec and plan.
- Medkit (1st) ran four separate Claude Code sessions, one per domain, "to keep each context clean".

Source: [Anthropic Opus 4.7 winners](https://www.claude.com/blog/meet-the-winners-of-built-with-opus-4-7-claude-code-hackathon). **[First-hand]** In an 8-hour GDG event, organizers required a mentor-approved SPEC.md, taking 90 minutes, before any agentic tool was allowed. They observed that "teams argued about scope before they argued about syntax" ([dev.to](https://dev.to/margoneto/the-rule-that-killed-just-start-coding-at-our-hackathon-jeb)).

**[Inference]** Planning shares ranged from about 15% to 40% of event time. For 40 hours, spend roughly 3–5 hours on a spec, a protocol contract and an ownership split before parallel coding. CLAUDE.md should point to those documents, not contain them.

### Failure modes

**[First-hand]** The failures reported are instructive:

- **Over-process.** Muxin Li imported a production-grade "best practices" scaffold into a solo hackathon. Claude implemented it faithfully, which caused drift and literal-minded subagents. Parallel worktrees then cost hours in git conflicts, and she submitted "with seconds to spare" ([Human Inference](https://humaninference.substack.com/p/why-i-didnt-win-the-opus-47-hackathon)).
- **Unread code.** A 24-hour team lost because the coder "trusted the AI generated code without fully reading or understanding it" and couldn't answer judges' questions ([shrit.substack](https://shrit.substack.com/p/lost-so-bad-got-humble-again)).
- **Usage limits.** A conductor-mode run hit the 5-hour usage limit, and auto-continue silently never fired ([dev.to](https://dev.to/day_b3fa2204948ded3059f6f/claude-codes-usage-limit-auto-continue-doesnt-run-in-remote-control-sessions-hooks-resume-them-2p52)).
- **Overly pessimistic estimates.** Wrench Board's builder overrode Claude's repeated claims that features wouldn't fit in time, and had more time than the model assumed ([Anthropic Opus 4.7 winners](https://www.claude.com/blog/meet-the-winners-of-built-with-opus-4-7-claude-code-hackathon)). Humans should own cut and keep decisions.

**[Inference]** The lesson for the file itself: say "this is a 40-hour prototype, not production". Then make sure nothing else in your setup contradicts that, including imported skills, plugins and big "best practice" rule packs.

### Verification under time pressure

**[First-hand]** Winners verified with one fast signal tied to the demo:

- **MaestrIA** built a 9-dimension eval over 12 real cases and advises making the eval "the first commit" of any future hackathon.
- **Torq** had Claude write comparison scripts and dropped components that didn't improve.
- **Virtual Puppet Theater** used a screenshot feedback loop.

Sources: [Anthropic Opus 4.7 winners](https://www.claude.com/blog/meet-the-winners-of-built-with-opus-4-7-claude-code-hackathon); [Torq](https://inbarshirizly.substack.com/p/coming-soon).

**[Inference]** Wire that signal up in the first hours and name it in CLAUDE.md as the definition of done ("run X and show the output before saying it works").

**[Template]** Feature-freeze hours and "mock data first" policies appear only in templates and generic guides, not first-hand accounts ([hackathon-setup README](https://github.com/rawadhossain/hackathon-setup)). Treat them as sensible but unvalidated.

## ESP32 firmware needs hardware facts in the file and serial behind a script

### Claude is good when a tool can check its work

**[First-hand]** Embedded reports split along one line. Claude is good when a tool can check its work and dangerous when correctness depends on recalled hardware facts:

- An XDA writer had Claude Code choose pins and write ESPHome YAML, then validate it with `esphome config` and `esphome compile` ([XDA](https://www.xda-developers.com/claude-code-taught-esp32-development-smart-home-projects-faster/)).
- Jacob Beningo found Claude-generated simulation harnesses with mocked hardware caught three state-machine bugs before boards arrived. He also warns it won't debug wrong pull-ups, timing violations or electrical faults ([Beningo](https://www.beningo.com/why-claude-code-for-firmware-development-matters/)).
- An Arduino Forum thread called Claude an "enthusiastic intern". A reply caught Claude-generated wiring that connected a 5V Nano directly to a 3.3V ESP8266 ([Arduino Forum](https://forum.arduino.cc/t/using-claude-code-ai-to-program-an-esp32/1366620)).
- Embedder's founders describe general agents writing drivers with "non-existent registers or HAL functions from the wrong chip family" ([HN Embedder](https://hn.nuxt.dev/item/44915206)).

**[First-hand]** The fix that recurs is to put the facts in the file rather than to tell Claude to look them up. Beningo's CLAUDE.md lists hardware platform, memory limits, RTOS, power budget, allowed libraries and known errata, and starts at about 20 lines ([Beningo](https://www.beningo.com/why-claude-code-for-firmware-development-matters/)). The esp32-claude-workbench CLAUDE.md encodes ESP32 pin rules and requires a `pin_audit` tool call before GPIO work ([workbench CLAUDE.md](https://raw.githubusercontent.com/agodianel/esp32-claude-workbench/main/CLAUDE.md)). Its pin rules for the classic ESP32 are:

- GPIO 6–11 are wired to internal flash: "Never use".
- GPIO 0/2/12/15 are strapping pins.
- GPIO 34–39 are input-only.
- ADC2 conflicts with Wi-Fi.

**[Inference]** These pin rules apply to the classic ESP32. S2, S3 and C3 differ, so state your exact module.

### Pin the core version and name the 3.x APIs

**[Official]** Version pinning matters because arduino-esp32 3.x broke many APIs that models trained on older code will reach for ([Espressif migration guide](https://docs.espressif.com/projects/arduino-esp32/en/latest/migration_guides/2.x_to_3.0.html)):

| 2.x (avoid on a 3.x core) | 3.x replacement |
|---|---|
| `ledcSetup` + `ledcAttachPin` (channel-based) | `ledcAttach` (pin-based) |
| `timerAlarmWrite` / `timerAlarmEnable` | `timerAlarm`; `timerBegin` takes only a frequency |
| `WiFiServer::available()` | `accept()` |
| `hallRead`, `adcAttachPin`, `analogSetClockDiv` | removed |
| BLE `std::string` | `String` |

**[Inference]** No sourced incident shows Claude actually emitting 2.x calls against a 3.x core. Listing the 3.x names is cheap insurance.

**[Unverified]** Whether PlatformIO's official `espressif32` platform currently ships arduino-esp32 3.x was not verified. Check your `platformio.ini` and state the actual core version.

### Serial: the biggest operational hazard

**[First-hand]** Serial ports are the biggest operational hazard. GitHub issues document four ways sessions froze, all now marked fixed or resolved:

- `espflash monitor` froze Claude Code. The fallback `timeout 10 cat /dev/cu…` failed because macOS has no `timeout` command ([#23745](https://claudeissues.com/issue/23745-bug-cli-freezes-on-serial-port-monitoring-commands-with-espflash-monitor)).
- The Read tool on `/dev/ttyACM*` blocked forever ([#17068](https://claudeissues.com/issue/17068-bug-claude-code-crashes-hangs-when-read-tool-attempts-to-access-dev-ttyacm-or-de)).
- A continuous `cat` of a serial port froze the CLI ([#11790](https://claudeissues.com/issue/11790-bug-claude-code-freezes-on-continuous-streaming-output-serial-ports-long-running)).
- Claude got stuck in an infinite read on a CDC-ACM device and needed `kill -9` ([#7607](https://claudeissues.com/issue/7607-bug-claude-code-automatically-opens-and-gets-stuck-reading-from-dev-ttyacm-devic)).

**[First-hand]** Working setups never let the agent hold an open serial session:

- An ESP32 skill bans `cat`/`dd`/`head`/`tail` on tty devices. It uses `scripts/monitor_serial.py <port> <seconds>` after a DTR/RTS reset, and edits `sdkconfig.defaults` rather than `sdkconfig` ([domes skill](https://skills.lc/pcesar22/domes/pcesar22-domes-claude-skills-esp32-firmware-skill-md)).
- espforge runs `devloop.py flash 120`, which flashes and writes 120 seconds of serial to a log file through a helper that "owns the COM port". It also documents the log-line protocol its tools depend on ([espforge](https://github.com/TheMonkeyz/espforge)).

**[Official]** Two port facts compound this: an open monitor holds the port and blocks upload, and some boards wire RTS/DTR to EN/GPIO0, so opening a monitor can hold the chip in reset unless `monitor_rts = 0` / `monitor_dtr = 0` are set ([espboards.dev](https://www.espboards.dev/troubleshooting/issues/usb/esp32-serial-conflict/); [PlatformIO forum](https://community.platformio.org/t/esp32-cam-freezes-after-clicking-start-monitoring-resets-on-stop-monitoring/33230)). That source is a vendor troubleshooting page and forum thread rather than official docs.

**[Inference]** Ship a `tools/capture.py` (pyserial, its own deadline, optional reset, `--until READY`, writes to `logs/`, exits with a status code). Tell Claude to use only that script, and deny `pio device monitor` in settings.

### Verifying without hardware

**[Official] / [First-hand]** The verification ladder people use runs from cheapest to most realistic:

1. **Compile-only.** `pio run -e <env>` after every change. Reverse-to-Build calls compiling "a first-order check when unit testing is impractical" ([Reverse to Build](https://reversetobuild.com/devlogs/claude-code-embedded-firmware-development/)).
2. **Native host tests with a mocked HAL.** `pio test -e native` with Unity, GoogleTest or Doctest. `--json-output-path` gives machine-readable results ([PlatformIO unit testing](https://docs.platformio.org/en/latest/advanced/unit-testing/index.html); [pio test](https://docs.platformio.org/en/latest/core/userguide/cmd_test.html)). The esp32-claude-workbench runs its non-hardware layers with `pytest -m "not hardware"`. Its CLAUDE.md requires every change to report commands, pass/fail results and a list of untested gaps ([workbench](https://github.com/agodianel/esp32-claude-workbench)).
3. **Wokwi simulation.** `wokwi-cli --timeout 10000 --expect-text "READY" --serial-log-file out.log` against `.pio/build/<env>/firmware.bin` ([Espressif Wokwi docs](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/third-party-tools/wokwi.html); [Wokwi config](https://docs.wokwi.com/vscode/project-config)). The free tier is **50 simulation minutes per 30 days with 5-minute sessions** ([Wokwi CI](https://docs.wokwi.com/wokwi-ci/getting-started)). **[Inference]** Four people sharing one free account will exhaust that in a weekend, so reserve it for smoke tests. Espressif warns simulation can differ from hardware. Wokwi's MCP server is labelled experimental, and **no first-hand report of Claude Code driving Wokwi end to end was found**.
4. **Real hardware.** **[Inference]** Since Claude can't wire, press BOOT or notice a hot regulator, the natural hackathon loop is: Claude builds and tests, a human flashes and runs the capture script, and Claude reads the log file. espforge's "user tries it" step reflects the same idea ([espforge](https://github.com/TheMonkeyz/espforge)).

**[Inference]** No public CLAUDE.md with explicit relay, motor or mains safety rules was found. That safety section is our recommendation, enforced by putting upload commands behind an `ask` permission.

## Four agents on one repo need walls and a contract, not etiquette

### What is shared and what is personal

**[Official]** The shared/personal split is:

- **Shared (committed):** `CLAUDE.md`, per-area CLAUDE.md files, `.claude/settings.json`, `.claude/skills/` and `.claude/hooks/` scripts. Commit `.claude/settings.json` "so everyone who clones the repository gets the same permissions, hooks, and plugins".
- **Personal (gitignored):** `CLAUDE.local.md` and `.claude/settings.local.json`.
- **Precedence**, highest first: managed, CLI, local, project, user. Permission arrays merge across scopes ([Settings docs](https://code.claude.com/docs/en/settings)).

**[Official]** Three documented gotchas bite small teams:

- **Trust:** project `allow` rules apply only after each teammate trusts the folder. `deny` and `ask` apply immediately. A teammate who never accepted trust silently gets more prompts.
- **Launch location:** project settings are read from the session's primary working directory and **are not inherited from parent directories**, unlike CLAUDE.md. Launching from `firmware/` skips a root-committed `.claude/settings.json` ([Settings docs](https://code.claude.com/docs/en/settings); [Large codebases docs](https://code.claude.com/docs/en/large-codebases)).
- **VS Code extension:** its approval card can write a rule to the shared project settings file, "which changes the rule for everyone" ([Settings docs](https://code.claude.com/docs/en/settings)).

**[Inference]** Launch Claude at the repo root, and scope each person with CLAUDE.md ownership rules plus personal `deny` rules in `settings.local.json`. Don't rely on launching from a subdirectory.

### Git workflow and worktrees

**[Official]** Isolation is per branch and per working tree. `claude --worktree <name>` creates `.claude/worktrees/<name>/` on a new branch, which you should gitignore. Each worktree:

- needs its own dependency install
- can receive `.env` via `.worktreeinclude`
- branches from the remote default branch by default
- blocks Edit and Write into the main checkout, but not `cp` or shell redirects

CLAUDE.md and rules load from the worktree itself ([Worktrees docs](https://code.claude.com/docs/en/worktrees)). For changes to shared types, the docs advise making the change and all its call sites in one planned session ([Large codebases docs](https://code.claude.com/docs/en/large-codebases)).

**[First-hand / third-party]** The reported failure modes:

- **Overwrites in a shared working tree.** Agents sharing a tree overwrite each other because nothing locks files ([OpenClaw DC](https://openclawdc.com/blog/parallel-agents-overwriting-each-other/)).
- **Semantic conflicts.** Git merges cleanly while a renamed function breaks the build ([ForeMerge](https://foremerge.com/blog/running-multiple-claude-code-agents-in-parallel/)).
- **Lockfile churn.** One HN commenter found a several-hundred-line lockfile diff from an unrequested `npm update` (seen via search summary only) ([HN](https://news.ycombinator.com/item?id=49506819)).
- **Out-of-area edits.** Agents edit outside their assigned directory ([#7150](https://github.com/anthropics/claude-code/issues/7150)).
- **Silent contract changes.** One agent silently changed an auth strategy or schema others depended on (a low-reliability Reddit mirror) ([mirror](https://reddit.sentinel-team.org/posts/1v0kfoo/snapshots/2026-07-20T20%3A24%3A21.6759Z)).

**[First-hand]** Muxin Li lost hours to unmanaged parallel worktrees ([Human Inference](https://humaninference.substack.com/p/why-i-didnt-win-the-opus-47-hackathon)). Torq found parallelism paid off only with one file or folder per instance ([Torq](https://inbarshirizly.substack.com/p/coming-soon)).

**[Inference]** Four people on four laptops are already isolated by separate clones, so the workflow is:

- one branch per person and area
- small, frequent commits
- `git pull --rebase` before pushing
- a human merges to `main`
- worktrees only when one person runs two or more simultaneous sessions

### The shared contract

**[Official]** No source prescribes a contract pattern for Claude Code specifically. The building blocks are all documented:

- `Edit(/protocol/**)` rules in `ask` or `deny` ([Permissions docs](https://code.claude.com/docs/en/permissions))
- a PreToolUse hook that exits 2 on protected paths, which the official example uses for `.env` and `package-lock.json` ([Hooks guide](https://code.claude.com/docs/en/hooks-guide))
- `git push` in `ask`, per the official team-settings example ([Settings examples](https://code.claude.com/docs/en/settings-example))

**[First-hand / third-party]** Agent-team guides consistently say to define contracts between domains before parallel work ([claudefa.st](https://claudefa.st/blog/guide/agents/agent-teams-workflow)).

**[Inference]** For a firmware-to-dashboard link:

- Put the message spec in `protocol/PROTOCOL.md` plus a JSON Schema and fixture payloads.
- Import it from the root CLAUDE.md.
- Make it ask-to-edit for everyone.
- Add a check script that validates fixtures, firmware sample output and dashboard parsing against the schema, so drift shows up as a red test rather than an agent "fix".
- Have firmware emit the same line protocol (`@J {...}`, `READY`, `FAIL:`) that the capture script parses, so serial logs and the dashboard share one format.

**[Official]** Anthropic's May 2026 large-codebase post recommends a single owner (DRI) for settings and CLAUDE.md conventions. It also recommends formatting via hooks rather than memory, and packaging good setups rather than leaving them tribal ([Claude blog](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start)). **[First-hand, secondhand report]** The Claude Code team itself reportedly adds a CLAUDE.md line whenever Claude errs ([paddo.dev](https://paddo.dev/blog/how-boris-uses-claude-code)).

**[Inference]** In a 40-hour event, one person owns the root CLAUDE.md, `.claude/settings.json` and `protocol/`. Area owners own their area files. Prune the root file at each merge-to-main sync.

## A starting kit you can adapt in the first hour

**[Inference]** The files below synthesize everything above. None is a tested artifact; it combines official mechanics with first-hand patterns, and the paths, board, pins and owners are placeholders. Dry-run the permission patterns with `/permissions` and run a quick hook test before the event.

**Root `CLAUDE.md` (~40 lines):**

```markdown
# <Project> — 40-hour hackathon prototype
ESP32 sensor node streams readings over serial/Wi-Fi to a web dashboard.
Goal: one reliable end-to-end demo journey by <deadline>. Prototype, not production.

## Source of truth (highest first)
docs/SPEC.md (MVP, stretch, cut list) > protocol/PROTOCOL.md > code.
If code and spec disagree, stop and say so instead of working around it.
@protocol/PROTOCOL.md

## Layout and owners
- firmware/  ESP32, Arduino core 3.x via PlatformIO (owners: A, B). See firmware/CLAUDE.md
- dashboard/ Vite + React + TS (owners: C, D). See dashboard/CLAUDE.md
- protocol/  message contract (owner: A). Do not edit; propose changes in docs/NOTES.md.

## Commands
- Firmware build: `cd firmware && pio run -e esp32dev`
- Firmware host tests: `cd firmware && pio test -e native`
- Dashboard: `cd dashboard && npm run dev` | `npm test` | `npm run typecheck`
- Contract check: `python tools/check_protocol.py` (fixtures + samples vs schema)
- Serial capture: `python tools/capture.py --port $ESP_PORT --seconds 20 --until READY --out logs/serial.log`

## Working rules
- Edit only the area you were asked to work in. If another area needs a change, stop and describe it.
- Never change protocol/ to make your side pass; write the mismatch to docs/NOTES.md and stop.
- Don't add dependencies or run `npm update` / `pio pkg update` unless asked (lockfile churn breaks teammates).
- Don't commit or push unless asked. Commit prefixes: fw: dash: proto: docs:
- Smallest end-to-end slice first. Mock data is fine only if it matches protocol/fixtures/.
- Done = the relevant check above passes and you show its output; list what you did not verify.
- If a hardware fact, API or version isn't in this repo, say so and ask. Don't guess.
- Never open a serial monitor or read /dev/tty* directly (it hangs the session); use tools/capture.py.

## Things that will bite you
- <add a line each time Claude makes the same mistake twice>

## When compacting
Preserve the list of modified files and the latest check results.
```

The serial rule sits in the root on purpose. **[Official]** A nested `firmware/CLAUDE.md` loads only when Claude touches a firmware file ([Memory docs](https://code.claude.com/docs/en/memory)). **[Inference]** A root-level "flash it and check the output" request could otherwise run without it.

**`firmware/CLAUDE.md` (~30 lines):**

```markdown
# Firmware
Board: <exact module, e.g. ESP32-S3-DevKitC-1 N16R8> | platform = espressif32@<pinned> | arduino-esp32 <3.x.y>
Pin map, wiring and voltages: docs/hardware.md (authoritative). Read it before any GPIO, I2C, SPI or UART change.

## Loop (cheapest first)
1. `pio run -e esp32dev` after every change; no new warnings.
2. `pio test -e native` for logic in lib/ (no Arduino.h there; hardware behind interfaces).
3. Optional: `wokwi-cli --timeout 10000 --expect-text "READY" --fail-text "Guru Meditation" --serial-log-file logs/sim.log` (limited free minutes).
4. Ask a human to flash; then read logs/serial.log from tools/capture.py.

## Serial and upload
- Uploads (`-t upload`) need a human OK. Kill any capture first; an open port blocks upload.
- macOS has no `timeout`; capture.py has its own deadline, so use it.

## Output protocol
`READY` after setup; `FAIL:<reason>` on fatal errors; `@J {json}` one object per line (schema in protocol/).

## Arduino core 3.x only
PWM: ledcAttach/ledcWrite by pin (not ledcSetup/ledcAttachPin). Timers: timerBegin(freq) + timerAlarm (not timerAlarmWrite/Enable). WiFiServer: accept(), not available().

## Hardware gotchas
- <module-specific: flash/PSRAM pins never to use, strapping pins, input-only pins, ADC2 vs Wi-Fi>
- Never add code that drives <relay/motor pins> without asking.
- No blocking delay() in networked loop(); use millis() or tasks.
```

**[Inference]** The `delay()` rule reflects common ESP32 practice, not a sourced Claude incident.

**`.claude/settings.json` (committed):**

```json
{
  "permissions": {
    "allow": ["Bash(pio run -e *)", "Bash(pio test *)", "Bash(npm run *)",
              "Bash(python tools/capture.py *)", "Bash(python tools/check_protocol.py*)"],
    "ask":   ["Bash(git push *)", "Bash(pio run * -t upload*)", "Edit(/protocol/**)",
              "Edit(/dashboard/package-lock.json)", "Edit(/firmware/platformio.ini)"],
    "deny":  ["Read(./.env)", "Read(./.env.*)", "Bash(pio device monitor*)", "Bash(idf.py monitor*)"]
  },
  "hooks": {
    "PostToolUse": [{ "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/format.sh" }] }]
  }
}
```

Personal `.claude/settings.local.json` adds area walls. The firmware pair adds `"deny": ["Edit(/dashboard/**)"]`, and the dashboard pair the reverse.

**[Inference]** Rules are evaluated deny, then ask, then allow. The broad `allow` on `pio run -e *` also matches upload commands, so the `ask` on upload only takes precedence if its pattern actually matches the commands Claude runs. That is why the dry-run above matters. **[Official]** Deny rules also do not stop a Python script from writing files ([Permissions docs](https://code.claude.com/docs/en/permissions)).

## How much of this rests on solid ground

| Topic | Strongest evidence | Where it is thin |
|---|---|---|
| Length and contents | Official docs; ETH study (+4% human-written, −0.5–2% LLM-generated) | Size-vs-adherence: official claim contradicted by one factorial study; no section-level ablations |
| Making rules stick | Official (hooks deterministic); arXiv drift and rationale studies | No A/B of emphasis words; canary trick anecdotal |
| Nested files, imports, local | Official load mechanics | No measured comparison of nested files vs `paths:` rules vs skills |
| Hackathon practice | First-hand winner profiles and post-mortems (self-reported) | Few real hackathon CLAUDE.md files published; no controlled comparisons; feature freeze and mock-first only in templates |
| ESP32 | First-hand GitHub issues (serial hangs), forum and blog reports, official PlatformIO, Wokwi and Espressif docs | No Reddit; no arduino-cli CLAUDE.md found; no report of Claude driving Wokwi; 2.x-API hallucination inferred; `timeout pio device monitor` combination untested |
| Four-person team | Official settings, permissions and worktree docs | **No first-hand 4-person hackathon account**; conflict advice from third-party blogs and a Reddit mirror |

## Conclusion

The evidence shifts where effort should go. The instinct at a hackathon is to write a thorough CLAUDE.md that anticipates every mistake. The best-supported findings say the file's job is narrow: tell Claude the few things it cannot infer, then get out of the way. Its reliability ceiling is set elsewhere, by session length, by deterministic hooks and permissions, and by a contract that a test can check. For a mixed firmware/web team, this matters doubly. The two failure classes that cost the most time are unrecoverable session hangs on serial ports and silent cross-boundary changes to a shared protocol. Both can be eliminated mechanically, with a deny rule and a capture script for the first, and an ask rule and a schema test for the second. Neither can be reliably prevented by prose.

The more novel implication concerns hardware facts. Telling Claude "don't guess pins" demonstrably fails; giving it the pin map and a tool to check against works. The same holds for the team: telling four agents to stay in their lanes is weaker than walls in `settings.local.json`. Treat CLAUDE.md as the map and settings as the fence. Have one person own both, and prune the map at every merge, because in a 40-hour sprint rules go stale within hours.

## Checklist

**Before the event (or hour 0–1)**

- [ ] Write `docs/SPEC.md` (MVP, stretch, cut list) and `protocol/PROTOCOL.md` + JSON Schema + fixtures before parallel coding; budget about 3–5 hours of the 40 for spec, contract and ownership.
- [ ] Hand-write a root CLAUDE.md of 40–80 lines. Use `/init` only as a draft and delete overviews and README restatement.
- [ ] Include: a one-line purpose and "prototype, not production"; source-of-truth order; a layout-and-owners table; exact build, test and capture commands; working rules with reasons; a gotchas section; a compaction line.
- [ ] Add `firmware/CLAUDE.md` and `dashboard/CLAUDE.md` (20–60 lines each), owned by each sub-team.
- [ ] Firmware file: exact module, pinned `platform` and core version, pin-map pointer, 3.x API names, output-line protocol, upload-needs-human rule.
- [ ] Ship `tools/capture.py` (bounded, writes to `logs/`, exits with a status). Put the "never open a monitor or read /dev/tty*" rule in the **root** file.
- [ ] Set up host tests (`pio test -e native`) with logic in `lib/` behind interfaces. Consider Wokwi for smoke tests only, mindful of the 50-minute free quota.
- [ ] Commit `.claude/settings.json`: allow build and test commands; ask on `git push`, upload, `protocol/**`, lockfiles and `platformio.ini`; deny `.env` reads and interactive monitors; add a format-on-edit hook. Dry-run every pattern.
- [ ] Gitignore `CLAUDE.local.md`, `.claude/settings.local.json` and `.claude/worktrees/`.
- [ ] Every teammate launches `claude` once at the repo root and accepts trust. Always launch from the root.

**During the event**

- [ ] One branch per person and area; small commits; `git pull --rebase` before pushing; a human merges to `main`; agents never push.
- [ ] Use worktrees only when one person runs two or more sessions. Personal notes go in `~/.claude/`, not CLAUDE.local.md, when using worktrees.
- [ ] Personal walls go in `settings.local.json` (deny `Edit` on the other area). Personal files add preferences and never contradict team rules.
- [ ] One session per task: `/clear` between tasks, and after two failed corrections.
- [ ] Add a CLAUDE.md line only when Claude repeats a mistake; pair "never X" with "use Y" and a short reason; use emphasis on at most one line.
- [ ] One owner for the root CLAUDE.md, settings and protocol. Contract changes go in their own small commit that both sides pull. Run the contract check on every merge.
- [ ] Prune CLAUDE.md at each sync point; run `/doctor prompt-audit` if rules seem ignored.
- [ ] Each owner reads and can explain their area's diffs, because judges ask.
- [ ] Watch usage limits on long autonomous runs; don't trust auto-continue unattended.
- [ ] Humans own cut and keep decisions. Claude's time estimates can be too pessimistic.
