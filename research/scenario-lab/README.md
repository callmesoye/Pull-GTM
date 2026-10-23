# Scenario lab data contract

520 distinct authored seller product/problem cases and 10 separate adversarial challenge specifications. Research checked 23 October 2026. They are research-grounded hypothetical scenarios, not independently observed sellers, buyer requests, benchmark truth labels or completed searches.

- `seeds.txt`: 52 sector headers and 520 seven-field rows, separated by `~`. Fields: product, place, seller problem, proposed buyer role, conditional purchase trigger, binding checks and mechanism ID. Product names and case IDs are unique. Case IDs are positional: do not reorder existing rows without a versioned migration.
- `mechanisms.json`: 20 purchase workflows, required proof, outcome measures, gap tags and suitability for optional business-directory navigation. Shared mechanisms are deliberate; different offers have different jobs, constraints and failure modes.
- `stress.json`: T521–T530 specify failures and required behavior. These are not an assertion that all ten features are implemented or passing end to end.
- `sources.json`: 51 published technical, policy, sector or business-route sources, with checked date, publication date when established, scope and retrieved-search-content review depth. IDs are intentionally non-contiguous because unrelated retrievals were rejected. Family-level links supply background, not local or individual transaction proof.
- `gap-actions.json`: all 38 mechanism gap tags, implementation states and concrete remaining work. Counts overlap and are not market prevalence.

`server/scenario-planner.js` validates these seeds and generates bounded existing research contracts. `offerScenarioGuidance` matches whole core product tokens to at most two guides; there is no semantic model, vector database or custom LLM training in this increment. Unmatched products retain their own research path. Guidance must not substitute a scenario's location, trigger or missing specification into the real offer.

`scripts/build-scenario-lab.mjs` reproduces JSON/CSV and empty-evidence review results. Generated cases never flow into live buyer status, independent labels or measured performance. Compiling plans executes no search and no Maps access.

See `docs/PULL-V2-530-SCENARIO-LAB.md` for interpretation, implemented behavior, research limits and the next execution slice.
