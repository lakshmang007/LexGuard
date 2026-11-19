# Datasets

LEXGUARD is tested on two free, openly licensed datasets. Both are redistributed here unchanged in content, under their original **CC BY 4.0** licences, with attribution below.

## `lexglue_unfair_tos/`: UNFAIR-ToS (LexGLUE)

- 9,414 sentences from 50 online Terms of Service (Tinder, Spotify, Dropbox, Facebook and others). Each sentence carries zero or more of 8 unfair-clause labels: Limitation of liability, Unilateral termination, Unilateral change, Content removal, Contract by using, Choice of law, Jurisdiction, Arbitration.
- Files: `train.jsonl` (5,532), `validation.jsonl` (2,275), `test.jsonl` (1,607). Each line is `{"company", "text", "labels"}`. The text is lower-cased and tokenised as in the original release.
- Source: the LexGLUE release on Zenodo (record 5532997), also at https://huggingface.co/datasets/coastalcph/lex_glue
- Licence: CC BY 4.0
- Cite: Chalkidis et al., *LexGLUE: A Benchmark Dataset for Legal Language Understanding in English*, ACL 2022; Lippi et al., *CLAUDETTE: an automated detector of potentially unfair clauses in online terms of service*, Artificial Intelligence and Law, 2019.

## `cuad/`: Contract Understanding Atticus Dataset (CUAD v1)

- `master_clauses.csv`: expert annotations of 41 clause categories across 510 commercial contracts from SEC filings.
- Source: https://huggingface.co/datasets/theatticusproject/cuad (file `CUAD_v1/master_clauses.csv`)
- Licence: CC BY 4.0
- Cite: Hendrycks et al., *CUAD: An Expert-Annotated NLP Dataset for Legal Contract Review*, NeurIPS 2021 Datasets and Benchmarks.

## How we use them

- Rules were tuned only on the UNFAIR-ToS **train** split and checked on **validation**. The **test** split was run once for the reported numbers, in `eval/results_public.md`.
- CUAD only has positive examples, so it is used to measure recall per clause category.
- These are US/EU business and consumer texts. The Indian offer-letter rules (bond, notice period, withheld documents) are only tested on our synthetic samples in `samples/`.
