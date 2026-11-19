# Rule reference

Generated from `engine/rules/rules.json` by `python tools/make_rules_doc.py`. Do not edit by hand.

LEXGUARD checks **32 kinds of risk** and **18 kinds of protection**. The level shown is a rule's starting level. The Defender can lower it when it finds a matching protection, and removes it when the sentence turns out to be the reader's own right or a promise to the reader. **IN** marks a rule written for Indian law.

## Risks

| # | Risk | Starts at | Applies to | Lowered by | What it means |
|---|---|---|---|---|---|
| 1 | Pay can be changed one-sided | HIGH | offer letters | needs your consent, written notice promise | Your pay can change without your agreement |
| 2 | Terms can be changed one-sided | HIGH | all | written notice promise, needs your consent | The other side can change the deal later without asking you |
| 3 | Termination without notice | HIGH | all | termination only for cause, written notice promise | You can be let go or cut off immediately, with no time to prepare |
| 4 | Service bond / exit penalty (IN) | HIGH | offer letters | pro-rata reduction | You may owe a large fixed penalty if you leave early |
| 5 | Salary or documents can be withheld (IN) | HIGH | offer letters | — | Your final pay or certificates could be held back to stop you leaving |
| 6 | Long notice period (IN) | MEDIUM | offer letters | notice buy-out | A long notice period can make it hard to join a new job quickly |
| 7 | Non-compete after leaving (IN) | MEDIUM | all | — | Limits where you can work next |
| 8 | Probation can be extended at will | MEDIUM | offer letters | written notice promise | Your probation, with weaker job security, could be stretched out |
| 9 | Transfer to any location | MEDIUM | offer letters | needs your consent | You could be moved to another city without a say |
| 10 | Owns work done outside job | MEDIUM | offer letters, quotations | — | The other side may claim ownership of your personal projects too |
| 11 | You give up the right to claim | HIGH | all | statutory rights kept | You give up your right to claim damages even if they are at fault |
| 12 | Their liability is limited | MEDIUM | all | exception for negligence/fraud, statutory rights kept | If something goes wrong, the other side may pay little or nothing |
| 13 | No responsibility for delays | MEDIUM | quotations, tickets | remedy for delay | Deadlines may not be binding, with no remedy for late delivery |
| 14 | Non-refundable payment | HIGH | all | refund window, refund if they cancel | You may lose your money even if you cancel early or the service changes |
| 15 | Extra or unclear fees | MEDIUM | all | all-inclusive price, fees listed up front | The final price may be higher than quoted, because extra fees or taxes are added later |
| 16 | Price can increase | MEDIUM | quotations, online policies | price locked | The price you agreed may go up after you commit |
| 17 | Large advance payment | MEDIUM | quotations | milestone payments | You pay most of the money before getting anything, which leaves you exposed |
| 18 | Heavy late-payment penalty | MEDIUM | quotations, online policies | — | A small delay in paying could cost you a lot |
| 19 | Automatic renewal | MEDIUM | all | renewal reminder, cancel any time | You may keep getting charged unless you remember to cancel |
| 20 | They can cancel or change the event | MEDIUM | tickets, online policies | refund if they cancel | The event or service can be cancelled or changed, possibly without a refund |
| 21 | Cannot transfer | LOW | tickets | — | If you can't attend, you can't pass it on, so the money is lost |
| 22 | One-sided indemnity | HIGH | all | mutual indemnity | You must cover their legal costs and losses, but they don't have to cover yours |
| 23 | Your data is shared | MEDIUM | all | opt-out or consent | Your personal details may be passed to other companies |
| 24 | Disputes only in their city | LOW | all | statutory rights kept | You may have to fight a dispute in a far-away city |
| 25 | Forced arbitration | MEDIUM | all | statutory rights kept | You may lose access to normal courts |
| 26 | Using it counts as agreeing | MEDIUM | all | — | Just using the service counts as agreeing, even if you never read or signed the terms, and that includes later changes |
| 27 | Your content can be removed | MEDIUM | all | — | Your posts, files, account data or purchased items can be deleted, possibly without warning or a refund |
| 28 | A far-away law applies | LOW | all | statutory rights kept | The contract follows another country's or state's law, which may give you fewer protections than your local consumer law |
| 29 | You can't challenge their rights | MEDIUM | all | statutory rights kept | You promise never to dispute their ownership or rights, even if you later find a real problem |
| 30 | They can end it early for any reason | MEDIUM | all | written notice promise | The other side can end the deal early even if you did nothing wrong, and you may lose the work or income you planned on |
| 31 | You hand over ownership of your work | MEDIUM | all | — | You give away ownership of what you create, so you may not be able to reuse or show it later |
| 32 | Fee or penalty for ending early | MEDIUM | all | pro-rata reduction | Leaving or cancelling early costs you a fixed fee, which may be more than the loss you actually cause |

## Protections

| Protection | Lowers the weight by |
|---|---|
| Written notice promise | 0.4 |
| Needs your consent | 0.55 |
| Termination only for cause | 0.35 |
| Pro-rata reduction | 0.35 |
| Notice buy-out | 0.3 |
| Renewal reminder | 0.3 |
| Cancel any time | 0.3 |
| Refund window | 0.35 |
| Refund if they cancel | 0.4 |
| All-inclusive price | 0.4 |
| Fees listed up front | 0.2 |
| Price locked | 0.35 |
| Milestone payments | 0.3 |
| Remedy for delay | 0.3 |
| Mutual indemnity | 0.4 |
| Exception for negligence/fraud | 0.3 |
| Statutory rights kept | 0.3 |
| Opt-out or consent | 0.35 |

## Adding or changing a rule

See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-or-changing-a-rule).
