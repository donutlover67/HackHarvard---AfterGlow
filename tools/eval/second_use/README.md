# Second Use eval and agent

Can this used panel power that device? Afterglow's Second Use agent answers from the panel's measured passport, on Chalk's Model Gateway, and this folder proves how well it does. Plain Python 3, no packages.

## The task

Each case is one panel passport (short-circuit current, open-circuit voltage, grade, flags), the site's peak sun hours a day, and a buyer's request in plain words ("a light on my garden path for four hours each evening"). The advisor answers which device, how many hours, whether the panel can run it, and what else it could run.

Truth (`su.py`): the panel's maximum power from the same single-diode model the bench, the site and the wiring eval use (`tools/eval/model.py`); a day's usable energy = maximum power × sun hours × 0.65 (a small charge controller and battery); the device needs watts × hours. It can when energy ≥ need. The device list is illustrative (typical average draws) and every advisor gets the same list, so the eval measures reasoning from the data, not datasheet knowledge.

`cases.json`: 212 cases, 12 on the demo batch's passports (`site/data/sample-run.json` and any run in `site/data/runs/` or `tools/eval/runs/`), 200 simulated like the wiring eval's batches. About half can be run, and most sit near the line (the panel gives a third to three times what the device needs).

## Metrics (`score.py`)

| Metric | Meaning |
|---|---|
| device understood | the request read as the right device |
| verdict right | can / can't matches the truth |
| says yes when it can't | false yes, as a share of the cases it can't: the costly mistake, a buyer gets a panel that won't run their device |
| says no when it can | false no, as a share of the cases it can: a sale lost |
| alternatives that work | of the suggestions, the share the panel can run at the device's typical hours |

Unanswered cases (a gateway error, no parseable answer) count as wrong.

## Results (openai/gpt-6.1-sol through Chalk's Model Gateway, 212 cases)

See `report-*.json`; `publish.py` puts them on the site's Second Use page. Baselines are handed the right device and hours.

| Advisor | Requests | Device understood | Verdict right | Says yes when it can't | Says no when it can | Alternatives that work |
|---|---|---|---|---|---|---|
| First prototype's rule (device watts ≤ Voc × Isc) | 212 | given | 62.7% | 51.3% | 20.6% | 37.2% |
| Plain assistant (passport numbers and device list, no formula, no tools) | 166* | 100% | 94.0% | 3.2% | 9.6% | 90.9% |
| Model alone, told the formula | 212 | 100% | 98.1% | 0% | 4.1% | 100% |
| **The agent: passport and physics tools** | 212 | 99.5% | **99.5%** | **0%** | **0%** | 100% |
| The physics tool alone, handed the right device (upper bound) | 212 | given | 100% | 0% | 0% | 100% |

\* Scored over the 166 it answered; counting the 46 unanswered as wrong gives 73.6%. 46 of the plain run's requests hit the key's token budget (`budget_limit tokens limit of 1000000 exceeded`) and are left out. The agent's one miss is a gateway 429 (the quota could not size that request), not a wrong answer: every answer it gave was right. All 12 cases on the demo batch's passports were right in every agent mode.

## Run it

```bash
python3 tools/eval/second_use/make_cases.py                       # cases.json (seed 11)
python3 tools/eval/second_use/baselines.py --naive > tools/eval/second_use/answers-naive.json
python3 tools/eval/second_use/baselines.py --tool  > tools/eval/second_use/answers-tool.json
python3 tools/eval/second_use/agent.py --list-models
python3 tools/eval/second_use/agent.py --mode tools --model openai/gpt-6.1-sol --out tools/eval/second_use/answers-agent-tools.json   # about 5 min
python3 tools/eval/second_use/agent.py --mode alone --model openai/gpt-6.1-sol --out tools/eval/second_use/answers-agent-alone.json
python3 tools/eval/second_use/agent.py --mode plain --model openai/gpt-6.1-sol --out tools/eval/second_use/answers-agent-plain.json
python3 tools/eval/second_use/score.py tools/eval/second_use/answers-agent-tools.json --json tools/eval/second_use/report-agent-tools.json
python3 tools/eval/second_use/publish.py                          # site/data/second-use.json
```

Modes: `tools` (the agent: it calls `get_passport` and `check_use`, and only `check_use` decides), `alone` (the same model told the formula, no tools), `plain` (a plain assistant: the passport numbers and the device list, no formula, no tools; what a lightweight chatbot would do).

The key: save it once from Terminal, outside the repo, readable only by you:

```bash
mkdir -p ~/.config/afterglow && printf '%s' 'YOUR_KEY' > ~/.config/afterglow/chalk_router_key && chmod 600 ~/.config/afterglow/chalk_router_key
```

Gateway notes found while wiring it up: requests must state an output limit or the token quota refuses them (429); this model takes function tools only on `/responses`, not `/chat/completions`, so the agent uses the Responses API.

## Tools in a Chalk sandbox

`chalk_sandbox.py` runs the agent's tool calls in a Chalk Compute sandbox: one sandbox per run receives the physics (`model.py`, `su.py`) and the passports, and every `get_passport` / `check_use` the model makes executes there. Checked: all 212 `check_use` calls give identical results in the sandbox and locally (0.13 s a call; the sandbox starts in under a second). It needs `chalkcompute` and a Chalk login, kept out of the repo:

```bash
uv venv --python 3.12 ~/.cache/afterglow-chalk && VIRTUAL_ENV=~/.cache/afterglow-chalk uv pip install chalkcompute
chalk login
~/.cache/afterglow-chalk/bin/python tools/eval/second_use/agent.py --mode tools --tools-in chalk --model openai/gpt-6.1-sol --out tools/eval/second_use/answers-agent-tools-chalk.json
AFTERGLOW_MODEL=openai/gpt-6.1-sol AFTERGLOW_TOOLS=chalk ~/.cache/afterglow-chalk/bin/python tools/eval/second_use/serve.py
```

Not yet run end to end: the gateway key's token budget (1,000,000) was spent by the three full runs above, and the gateway refuses agent-sized requests until it is raised.

## On the site

`#/reuse`: steps 1 and 2 (what the panel can run) work anywhere, from `site/data/second-use.json`. Step 3 asks the agent, which runs on the demo laptop:

```bash
AFTERGLOW_MODEL=openai/gpt-6.1-sol python3 tools/eval/second_use/serve.py     # http://127.0.0.1:8767/second-use
```

It answers pages served from localhost only (it spends the key's quota).
