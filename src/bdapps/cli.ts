/**
 * Command-line tester for the BDApps APIs. Run with:
 *
 *   npm run bdapps -- <command> [args...]
 *
 * Examples:
 *   npm run bdapps -- otp:request 01812345678
 *   npm run bdapps -- otp:verify 213561321321613 123456
 *   npm run bdapps -- sms 01812345678 Hello there
 *   npm run bdapps -- balance 01812345678
 *   npm run bdapps -- charge 01812345678 2
 *   npm run bdapps -- sub:status 01812345678
 *
 * Requires BDAPPS_APP_ID + BDAPPS_PASSWORD in .env, and your public IP
 * whitelisted in the app's "Allowed Host Address(es)".
 */
import { bdapps, isSuccess, BdappsError } from "./index.js";

function print(label: string, res: unknown): void {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(res, null, 2));
  if (res && typeof res === "object" && "statusCode" in res) {
    const code = (res as { statusCode?: string }).statusCode;
    console.log(isSuccess(res as { statusCode?: string }) ? "\n✅ SUCCESS (S1000)" : `\n❌ FAILED (${code})`);
  }
}

const HELP = `
BDApps CLI — usage: npm run bdapps -- <command> [args]

  sms <mobile> <message...>          Send an SMS
  broadcast <message...>             Send to all subscribers (tel:all)
  otp:request <mobile>               Send an OTP, get a referenceNo
  otp:verify <referenceNo> <otp>     Verify an OTP code
  balance <mobile>                   Query mobile balance
  pi <mobile>                        List payment instruments
  charge <mobile> <amount>           Direct-debit an amount (real money!)
  sub:status <mobile>                Check subscription status
  sub:add <mobile>                   Subscribe a user
  sub:remove <mobile>                Unsubscribe a user
`;

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "sms": {
      const [mobile, ...rest] = args;
      if (!mobile || rest.length === 0) throw new Error("usage: sms <mobile> <message...>");
      print("Send SMS", await bdapps.sendSms(mobile, rest.join(" ")));
      break;
    }
    case "broadcast": {
      if (args.length === 0) throw new Error("usage: broadcast <message...>");
      print("Broadcast SMS", await bdapps.broadcastSms(args.join(" ")));
      break;
    }
    case "otp:request": {
      const [mobile] = args;
      if (!mobile) throw new Error("usage: otp:request <mobile>");
      print("Request OTP", await bdapps.requestOtp(mobile));
      break;
    }
    case "otp:verify": {
      const [referenceNo, otp] = args;
      if (!referenceNo || !otp) throw new Error("usage: otp:verify <referenceNo> <otp>");
      print("Verify OTP", await bdapps.verifyOtp(referenceNo, otp));
      break;
    }
    case "balance": {
      const [mobile] = args;
      if (!mobile) throw new Error("usage: balance <mobile>");
      print("Query Balance", await bdapps.queryBalance(mobile));
      break;
    }
    case "pi": {
      const [mobile] = args;
      if (!mobile) throw new Error("usage: pi <mobile>");
      print("Payment Instruments", await bdapps.listPaymentInstruments(mobile));
      break;
    }
    case "charge": {
      const [mobile, amount] = args;
      if (!mobile || !amount) throw new Error("usage: charge <mobile> <amount>");
      print("Direct Debit", await bdapps.directDebit({ mobile, amount }));
      break;
    }
    case "sub:status": {
      const [mobile] = args;
      if (!mobile) throw new Error("usage: sub:status <mobile>");
      print("Subscription Status", await bdapps.getSubscriptionStatus(mobile));
      break;
    }
    case "sub:add": {
      const [mobile] = args;
      if (!mobile) throw new Error("usage: sub:add <mobile>");
      print("Subscribe", await bdapps.subscribe(mobile));
      break;
    }
    case "sub:remove": {
      const [mobile] = args;
      if (!mobile) throw new Error("usage: sub:remove <mobile>");
      print("Unsubscribe", await bdapps.unsubscribe(mobile));
      break;
    }
    default:
      console.log(HELP);
      if (cmd) throw new Error(`Unknown command: ${cmd}`);
  }
}

main().catch((err: unknown) => {
  if (err instanceof BdappsError) {
    console.error(`\n❌ BDApps error [${err.statusCode}]: ${err.message}`);
  } else {
    console.error(`\n❌ ${(err as Error).message}`);
  }
  process.exit(1);
});
