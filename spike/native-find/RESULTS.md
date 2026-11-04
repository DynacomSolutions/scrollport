# Native find spike: raw results

Source: results.jsonl (30 records). Times in ms, memory in MiB.

## Load and memory

| browser | variant | rows | status | html MiB | DCL | load | peak MiB | wall | Nodes | LayoutObjects | JSHeap MiB | note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | cv-full | 10000 | ok | 12 | 709 | 760 | 2678 | 18593 | 550095 | 83 | 1 |  |
| chromium | cv-full | 100000 | timeout |  |  |  | 8201 | 301859 |  |  |  |  |
| chromium | cv-full | 300000 | skipped |  |  |  |  |  |  |  |  | smaller size hit oom/timeout in this browser |
| chromium | cv-full | 1000000 | skipped |  |  |  |  |  |  |  |  | smaller size hit oom/timeout in this browser |
| chromium | uf-text | 100000 | ok | 37 | 1113 | 1207 | 1362 | 32671 | 226800 | 27763 | 1 |  |
| chromium | uf-text | 1000000 | ok | 367 | 8145 | 8230 | 7768 | 142621 | 2028923 | 29563 | 1 |  |
| chromium | uf-text | 3000000 | timeout |  |  |  | 8202 | 303440 |  |  |  |  |
| chromium | uf-cells | 100000 | timeout |  |  |  | 8309 | 301891 |  |  |  |  |
| chromium | uf-cells | 300000 | skipped |  |  |  |  |  |  |  |  | smaller size hit oom/timeout in this browser |
| chromium | uf-cells | 1000000 | skipped |  |  |  |  |  |  |  |  | smaller size hit oom/timeout in this browser |
| firefox | cv-full | 10000 | ok | 12 | 2419 | 2420 | 1036 | 77850 |  |  |  |  |
| firefox | cv-full | 100000 | ok | 120 | 19502 | 19502 | 6582 | 91393 |  |  |  |  |
| firefox | cv-full | 300000 | error |  |  |  | 8334 | 234601 |  |  |  | page.goto: Timeout 200000ms exceeded. |
| firefox | cv-full | 1000000 | error |  |  |  | 8428 | 241539 |  |  |  | page.goto: Timeout 200000ms exceeded. |
| firefox | uf-text | 100000 | ok | 37 | 2749 | 2772 | 969 | 32155 |  |  |  |  |
| firefox | uf-text | 1000000 | ok | 367 | 9749 | 9749 | 5098 | 116551 |  |  |  |  |
| firefox | uf-text | 3000000 | error |  |  |  | 8507 | 239648 |  |  |  | page.goto: Timeout 200000ms exceeded. |
| firefox | uf-cells | 100000 | ok | 120 | 28812 | 28813 | 6408 | 83379 |  |  |  |  |
| firefox | uf-cells | 300000 | error |  |  |  | 8204 | 236024 |  |  |  | page.goto: Timeout 200000ms exceeded. |
| firefox | uf-cells | 1000000 | error |  |  |  | 8388 | 239640 |  |  |  | page.goto: Timeout 200000ms exceeded. |
| webkit | cv-full | 10000 | error |  |  |  | 153 | 2020 |  |  |  | missing system deps (libicu74, libflite1) |
| webkit | cv-full | 100000 | error |  |  |  |  |  |  |  |  | browser failed to launch earlier (see first error for this browser) |
| webkit | cv-full | 300000 | error |  |  |  |  |  |  |  |  | browser failed to launch earlier (see first error for this browser) |
| webkit | cv-full | 1000000 | error |  |  |  |  |  |  |  |  | browser failed to launch earlier (see first error for this browser) |
| webkit | uf-text | 100000 | error |  |  |  |  |  |  |  |  | browser failed to launch earlier (see first error for this browser) |
| webkit | uf-text | 1000000 | error |  |  |  |  |  |  |  |  | browser failed to launch earlier (see first error for this browser) |
| webkit | uf-text | 3000000 | error |  |  |  |  |  |  |  |  | browser failed to launch earlier (see first error for this browser) |
| webkit | uf-cells | 100000 | error |  |  |  |  |  |  |  |  | browser failed to launch earlier (see first error for this browser) |
| webkit | uf-cells | 300000 | error |  |  |  |  |  |  |  |  | browser failed to launch earlier (see first error for this browser) |
| webkit | uf-cells | 1000000 | error |  |  |  |  |  |  |  |  | browser failed to launch earlier (see first error for this browser) |

## Text fragment (#:~:text=token of row n-10)

| browser | variant | rows | in viewport | time to target | hidden attr removed | beforematch | scrollY | load done at end | after load: readyState | after load: in viewport | after load: scrollY | navError |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | cv-full | 10000 | yes | 5809 | yes | no | 319232 | complete | complete | yes | 319232 |  |
| chromium | cv-full | 100000 |  |  |  |  |  |  |  |  |  |  |
| chromium | cv-full | 300000 |  |  |  |  |  |  |  |  |  |  |
| chromium | cv-full | 1000000 |  |  |  |  |  |  |  |  |  |  |
| chromium | uf-text | 100000 | yes | 6770 | yes | yes | 3199232 | complete | complete | yes | 3199232 |  |
| chromium | uf-text | 1000000 | no |  | yes | yes | 16776816 | complete | complete | no | 16776816 |  |
| chromium | uf-text | 3000000 |  |  |  |  |  |  |  |  |  |  |
| chromium | uf-cells | 100000 |  |  |  |  |  |  |  |  |  |  |
| chromium | uf-cells | 300000 |  |  |  |  |  |  |  |  |  |  |
| chromium | uf-cells | 1000000 |  |  |  |  |  |  |  |  |  |  |
| firefox | cv-full | 10000 | no |  | yes | no | 0 | complete | complete | no | 0 |  |
| firefox | cv-full | 100000 | no |  | yes | no | 0 | complete | complete | no | 0 |  |
| firefox | cv-full | 300000 |  |  |  |  |  |  |  |  |  |  |
| firefox | cv-full | 1000000 |  |  |  |  |  |  |  |  |  |  |
| firefox | uf-text | 100000 | yes | 6618 | yes | no | 3199232 | complete | complete | yes | 3199232 |  |
| firefox | uf-text | 1000000 | no |  | yes |  | 17894898 | complete | complete | no | 17894898 |  |
| firefox | uf-text | 3000000 |  |  |  |  |  |  |  |  |  |  |
| firefox | uf-cells | 100000 | yes | 34999 | yes | yes | 3199232 | interactive | complete | yes | 3199232 |  |
| firefox | uf-cells | 300000 |  |  |  |  |  |  |  |  |  |  |
| firefox | uf-cells | 1000000 |  |  |  |  |  |  |  |  |  |  |
| webkit | cv-full | 10000 |  |  |  |  |  |  |  |  |  |  |
| webkit | cv-full | 100000 |  |  |  |  |  |  |  |  |  |  |
| webkit | cv-full | 300000 |  |  |  |  |  |  |  |  |  |  |
| webkit | cv-full | 1000000 |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-text | 100000 |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-text | 1000000 |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-text | 3000000 |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-cells | 100000 |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-cells | 300000 |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-cells | 1000000 |  |  |  |  |  |  |  |  |  |  |

## window.find(token of row n-10)

| browser | variant | rows | returned | duration (1st) | returned (2nd) | duration (2nd) | hidden before | hidden after | revealed | in viewport | beforematch events | scrollY | error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | cv-full | 10000 | yes | 5129 | yes | 548 | no | no | no | yes | 0 | 319232 |  |
| chromium | cv-full | 100000 |  |  |  |  |  |  |  |  |  |  |  |
| chromium | cv-full | 300000 |  |  |  |  |  |  |  |  |  |  |  |
| chromium | cv-full | 1000000 |  |  |  |  |  |  |  |  |  |  |  |
| chromium | uf-text | 100000 | yes | 7056 | yes | 1126 | yes | yes | no | no | 0 | 3183641 |  |
| chromium | uf-text | 1000000 | yes | 50242 | yes | 10516 | yes | yes | no | no | 0 | 16776816 |  |
| chromium | uf-text | 3000000 |  |  |  |  |  |  |  |  |  |  |  |
| chromium | uf-cells | 100000 |  |  |  |  |  |  |  |  |  |  |  |
| chromium | uf-cells | 300000 |  |  |  |  |  |  |  |  |  |  |  |
| chromium | uf-cells | 1000000 |  |  |  |  |  |  |  |  |  |  |  |
| firefox | cv-full | 10000 | yes | 209 |  |  | no | no | no | yes | 0 | 319232 |  |
| firefox | cv-full | 100000 | yes | 2459 |  |  | no | no | no | yes | 0 | 3199232 |  |
| firefox | cv-full | 300000 |  |  |  |  |  |  |  |  |  |  |  |
| firefox | cv-full | 1000000 |  |  |  |  |  |  |  |  |  |  |  |
| firefox | uf-text | 100000 | yes | 1424 |  |  | yes | no | yes | yes | 1 | 3199232 |  |
| firefox | uf-text | 1000000 | yes | 14610 |  |  | yes | no | yes | no | 1 | 17894898 |  |
| firefox | uf-text | 3000000 |  |  |  |  |  |  |  |  |  |  |  |
| firefox | uf-cells | 100000 | yes | 3543 |  |  | yes | no | yes | yes | 1 | 3199232 |  |
| firefox | uf-cells | 300000 |  |  |  |  |  |  |  |  |  |  |  |
| firefox | uf-cells | 1000000 |  |  |  |  |  |  |  |  |  |  |  |
| webkit | cv-full | 10000 |  |  |  |  |  |  |  |  |  |  |  |
| webkit | cv-full | 100000 |  |  |  |  |  |  |  |  |  |  |  |
| webkit | cv-full | 300000 |  |  |  |  |  |  |  |  |  |  |  |
| webkit | cv-full | 1000000 |  |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-text | 100000 |  |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-text | 1000000 |  |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-text | 3000000 |  |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-cells | 100000 |  |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-cells | 300000 |  |  |  |  |  |  |  |  |  |  |  |
| webkit | uf-cells | 1000000 |  |  |  |  |  |  |  |  |  |  |  |
