/**
 * Unit check for the widget identity assertions (lib/assertion.ts) — pure
 * crypto, no database, no server. Mirrors the sign/verify contract the Hearth
 * server duplicates when minting assertions.
 *
 *   bun run scripts/assertion-check.mjs
 */
import { signAssertion, verifyAssertion } from "../lib/assertion.ts"

let failures = 0
const ok = (label, cond) => {
  if (!cond) failures++
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`)
}

const SECRET = "test-secret-long-enough-for-hmac"
const payload = {
  email: "sam@hearth.test",
  name: "Sam",
  exp: Math.floor(Date.now() / 1000) + 600,
}

const token = signAssertion(payload, SECRET)
const back = verifyAssertion(token, SECRET)
ok("round-trip verifies", back?.email === payload.email && back?.name === "Sam")

ok("wrong secret rejects", verifyAssertion(token, "nope") === null)

const tampered = `${Buffer.from(
  JSON.stringify({ ...payload, email: "ram@tesuto.test" }),
).toString("base64url")}.${token.split(".")[1]}`
ok("tampered payload rejects", verifyAssertion(tampered, SECRET) === null)

const expired = signAssertion(
  { ...payload, exp: Math.floor(Date.now() / 1000) - 60 },
  SECRET,
)
ok("expired rejects", verifyAssertion(expired, SECRET) === null)

ok("garbage rejects", verifyAssertion("not-a-token", SECRET) === null)
ok("missing secret rejects", verifyAssertion(token, "") === null)

try {
  signAssertion(payload, "")
  ok("sign without secret throws", false)
} catch {
  ok("sign without secret throws", true)
}

console.log(failures ? `\n${failures} failing` : "\nall green")
process.exit(failures ? 1 : 0)
