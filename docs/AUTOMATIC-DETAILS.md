# Let Lumo supply known details

Everyday v12, 21 October 2026. Restorable starting point: published v11,
commit `0c6a6d35b9de648581e109d04e5aa039492856dd`, checkpoint
`checkpoint-before-automatic-network-20261021`.

Ask for customer intent and information Lumo cannot retrieve. Use account data,
authoritative lookups and known merchant/biller records for everything else.
An unavailable lookup is not permission to guess.

## Implemented

| Surface | Previously | Now |
| --- | --- | --- |
| Mobile-money transfer | Network, number, amount | Number and amount; network fills automatically |
| Add money from MoMo | Network, own number, amount, ownership confirmation | Registered wallet shown from profile; amount and ownership confirmation |
| Airtime/data | Network, phone, amount/package | Phone and amount/package; network fills automatically; own number remains prefilled |
| Water | One-option provider selector, account, amount | Ghana Water supplied; account and amount |

Recipient names, merchant names, fixed request/sale amounts, fees, available money
and support references continue to use existing data rather than asking again.
Bank, TV/internet provider and electricity service choices remain because the
prototype has no reliable lookup that removes those ambiguities. Category and
plan purpose remain optional customer intent. PIN and ownership/consent controls
are retained.

## Lookup contract

`dist/mobile-network.js` is the shared lookup service used by transfers, funding,
airtime and data. It accepts an exact normalized Ghana phone number. Operator
responses are limited to known canonical identifiers and must match that number.
International/local input formats normalize to one lookup key.

The bundled adapter is a simulation using exact fixture responses, including a
number with an MTN-style prefix whose sample response is Telecel. It never derives
the carrier from a prefix. A newly entered demo-profile number has an explicitly
fictional MTN response so sign-up can still explore funding. The interface labels
these results **Sample lookup**. This says nothing about a real number's network.

No live network API or credentials are connected. The product build must replace
the sample adapter with an authenticated server-side network lookup. Client keys
and direct unauthenticated production calls are not part of this implementation.

Both immediate responses and asynchronous responses are supported. Pending
lookups show a compact status. Review can wait for a current response without
adding a screen or payment stage. Failed, malformed or mismatched responses leave
the form editable and offer retry. An old number's response cannot supply the
network for a newly entered number. Leaving or replacing a draft prevents late
responses from advancing it.

Network identification does not verify a recipient's name or wallet ownership.
The existing account/name check and PIN path remain separate. Ownership
confirmation for a registered funding wallet stays explicit. Changing the
registered number requires fresh confirmation; a submitted pending top-up retains
its original wallet/network snapshot. The reviewed payment signature now includes
the provider, so a changed provider cannot use old authorisation details.

## Verification

- 14 new automatic-network and reduced-input checks cover all four mobile flows,
  exact fixture/operator mapping, international formats, changed numbers, stale
  asynchronous responses, retries, malformed responses, dismissal, owned-wallet
  constraints, pending snapshots and provider changes after review.
- 118 related regression checks pass: transactions (18), completion (10), sheets
  (71), payment integrity (14) and independent storage/module ordering (5).
- Category and Chat corrections (38), Pause timing/reduced motion/hold (22), and
  route/handler audit (4) pass.
- Browser QA confirmed the transfer displays only number and amount, shows the
  derived sample network, and carries the correct name/network/fee into Review.
  Funding shows the saved wallet as text, with no editable phone or network field.

The existing identity, financial rules, three payment stages, saved data and public
access remain. There is no new claim of live network coverage or physical-phone
keyboard validation. The two original prototype projects were not edited.
