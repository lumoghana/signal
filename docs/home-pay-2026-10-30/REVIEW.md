# Home Pay label

The Monochrome Home quick action now reads **Pay**. It retains the existing full Payments destination, with Send money, Campus Pay and Bills & top-ups. The Home composition, financial calculations and payment controllers are unchanged.

Existing actual-entry tests now expect Pay for Monochrome while preserving Transfer expectations for other editions.

Browser review used an isolated, in-memory sample profile. Home → Pay opened the full Payments page. All six Home/Payments layout cases passed at 375 × 667, 390 × 844 and 320 × 568 with 200% text, with no layout findings or setup errors. `home-pay.jpg` shows the actual Home rendering at 375 × 667.

Release verification: all 519 tests passed in `node scripts/check-edition-parity.cjs --regression --sequential`; the approved edition baseline, generated build and whitespace checks passed. Temporary audit pages were removed before packaging.

The broader Home recommendation remains a proposed next iteration: use the existing Ask Lumo card for one timely interpretation of saved facts and one relevant next action, with late allowance and essential costs taking priority over optional goal progress. This release changes only the Pay label.
