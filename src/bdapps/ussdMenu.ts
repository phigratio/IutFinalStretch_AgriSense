import type { IncomingUssd } from "./types.js";

export interface UssdReply {
  message: string;
  /** mt-cont keeps the session open for another reply; mt-fin ends it. */
  operation: "mt-cont" | "mt-fin";
}

/**
 * A tiny example USSD menu. Pure function (no I/O) so it's easy to unit-test.
 * Replace the branches with your hackathon logic.
 *
 *   Dial the code       -> ussdOperation "mo-init" -> we show the menu (mt-cont)
 *   Pick 1 / 2 / other  -> ussdOperation "mo-cont" -> we answer and end (mt-fin)
 */
export function handleUssd(incoming: IncomingUssd): UssdReply {
  const input = (incoming.message ?? "").trim();

  if (incoming.ussdOperation === "mo-init") {
    return {
      message: "Welcome to the demo!\n1. Say hello\n2. Server time",
      operation: "mt-cont",
    };
  }

  // mo-cont: the user replied to our menu.
  switch (input) {
    case "1":
      return { message: "Hello from your BDApps hackathon app!", operation: "mt-fin" };
    case "2":
      return { message: `Server time: ${new Date().toISOString()}`, operation: "mt-fin" };
    default:
      return { message: `You typed "${input}". Invalid option, goodbye!`, operation: "mt-fin" };
  }
}
