# LEXGUARD on public datasets

## LexGLUE UNFAIR-ToS (test split, 1607 sentences)

| Metric | Value |
|---|---|
| Unfair sentences flagged (recall) | 74.4% |
| Flags that were really unfair (precision) | 56.4% |
| F1 | 0.642 |
| Fair sentences flagged at any level | 6.9% |
| Fair sentences flagged HIGH | 3.0% |
| Speed | 0.72 ms per sentence |

| Unfair type | Sentences | Caught by the matching rule |
|---|---|---|
| Arbitration | 7 | 86% |
| Choice of law | 13 | 85% |
| Content removal | 13 | 85% |
| Contract by using | 23 | 70% |
| Jurisdiction | 16 | 69% |
| Limitation of liability | 38 | 82% |
| Unilateral change | 38 | 60% |
| Unilateral termination | 38 | 66% |

## CUAD v1 (holdout half: 255 contracts, 941 annotated clauses)

| CUAD category | Clauses | Caught by the matching rule | Flagged by any rule |
|---|---|---|---|
| Renewal Term | 101 | 66% | 69% |
| Non-Compete | 124 | 51% | 52% |
| Cap On Liability | 314 | 74% | 74% |
| Liquidated Damages | 67 | 70% | 76% |
| Covenant Not To Sue | 87 | 46% | 46% |
| Termination For Convenience | 105 | 45% | 50% |
| Ip Ownership Assignment | 143 | 44% | 46% |
