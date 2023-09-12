import "reflect-metadata";
import nacl from "nacl";
import {
  DiscordInteraction,
  DiscordInteractionResponse,
  InteractionResponseTypes,
  InteractionTypes,
} from "discordeno";

export class Client {
  isValidBody(
    body: string | { error: string; status: number },
  ): body is string {
    return typeof body === "string";
  }

  async validateRequest(request: Request) {
    const REQUIRED_HEADERS = ["X-Signature-Ed25519", "X-Signature-Timestamp"];
    if (request.method !== "POST") {
      return { error: "Method not allowed", status: 405 };
    }
    if (!REQUIRED_HEADERS.every((header) => request.headers.has(header))) {
      return { error: "Missing headers", status: 400 };
    }
    const { valid, body } = await this.verifySignature(request);
    if (!valid) {
      return { error: "Invalid signature", status: 401 };
    }
    return body;
  }

  async handleInteraction(
    interaction: DiscordInteraction,
  ): Promise<DiscordInteractionResponse | { error: string; status: number }> {
    switch (interaction.type) {
      case InteractionTypes.Ping: {
        return {
          type: InteractionResponseTypes.Pong,
        };
      }
      case InteractionTypes.ApplicationCommand: {
        const command:
          | ((i: DiscordInteraction) => Promise<DiscordInteractionResponse>)
          | undefined = Reflect.getMetadata(
            `command:${interaction.data!.name}`,
            this,
          );
        if (!command) {
          return {
            type: InteractionResponseTypes.ChannelMessageWithSource,
            data: { content: "Command not found", flags: 1 << 6 },
          };
        }
        return await command(interaction);
      }
      default: {
        return { error: "Invalid interaction type", status: 400 };
      }
    }
  }

  bootstrap() {
    const count = Reflect.getMetadata(`total`, this) || 0;
    if (count === 0) {
      throw "No commands registered";
    }

    return async (request: Request) => {
      const body = await this.validateRequest(request);
      if (!this.isValidBody(body)) {
        const { error, status } = body;
        return new Response(JSON.stringify({ error }), { status });
      }
      const interaction: DiscordInteraction = JSON.parse(body);
      const response = await this.handleInteraction(interaction);

      return new Response(
        JSON.stringify(response),
        {
          headers: { "content-type": "application/json" },
        },
      );
    };
  }

  async verifySignature(request: Request) {
    const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY")!;
    const signature = request.headers.get("X-Signature-Ed25519")!;
    const timestamp = request.headers.get("X-Signature-Timestamp")!;
    const body = await request.text();
    const valid = nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + body),
      this.hexToUint8Array(signature),
      this.hexToUint8Array(PUBLIC_KEY),
    );

    return { valid, body };
  }

  hexToUint8Array(hex: string) {
    return new Uint8Array(
      hex.match(/.{1,2}/g)!.map((val) => parseInt(val, 16)),
    );
  }
}

export function Command(name: string): MethodDecorator {
  return (target, _propertyKey, { value }) => {
    const count = Reflect.getMetadata(`total`, target) || 0;
    if (Reflect.getMetadata(`command:${name}`, target) !== undefined) {
      throw new Error(`Command ${name} already registered`);
    }
    console.log(
      `%c%s %c/${name}`,
      "color: magenta;",
      "==>",
      "color: lime; font-weight: bold",
    );
    Reflect.defineMetadata(`command:${name}`, value, target);
    Reflect.defineMetadata(`total`, count + 1, target);
  };
}
