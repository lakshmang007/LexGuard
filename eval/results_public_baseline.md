# LEXGUARD on public datasets

## LexGLUE UNFAIR-ToS (test split, 1607 sentences)

| Metric | Value |
|---|---|
| Unfair sentences flagged (recall) | 28.5% |
| Flags that were really unfair (precision) | 45.8% |
| F1 | 0.351 |
| Fair sentences flagged at any level | 4.0% |
| Fair sentences flagged HIGH | 2.4% |
| Speed | 0.43 ms per sentence |

| Unfair type | Sentences | Caught by the matching rule |
|---|---|---|
| Arbitration | 7 | 57% |
| Choice of law | 13 | 0% |
| Content removal | 13 | 0% |
| Contract by using | 23 | 0% |
| Jurisdiction | 16 | 12% |
| Limitation of liability | 38 | 29% |
| Unilateral change | 38 | 53% |
| Unilateral termination | 38 | 16% |

## CUAD v1 (510 contracts, 1848 annotated clauses)

| CUAD category | Clauses | Caught by the matching rule | Flagged by any rule |
|---|---|---|---|
| Renewal Term | 199 | 43% | 45% |
| Non-Compete | 226 | 7% | 9% |
| Cap On Liability | 632 | 16% | 16% |
| Liquidated Damages | 113 | 53% | 59% |
| Covenant Not To Sue | 159 | 2% | 2% |
| Termination For Convenience | 223 | 15% | 18% |
| Ip Ownership Assignment | 296 | 0% | 1% |
