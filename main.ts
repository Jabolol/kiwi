import "reflect-metadata";
import nacl from "nacl";
import {
  DiscordInteraction,
  DiscordInteractionResponse,
  InteractionResponseTypes,
  InteractionTypes,
} from "discordeno";
import { Command } from "./decorators.ts";

export class App {
  @Command("hello")
  hello(interaction: DiscordInteraction): DiscordInteractionResponse {
    return {
      type: InteractionResponseTypes.ChannelMessageWithSource,
      data: {
        content: `Hello \`${interaction.member?.user.username}\`!`,
      },
    };
  }

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

  handleInteraction(
    interaction: DiscordInteraction,
  ): DiscordInteractionResponse | { error: string; status: number } {
    switch (interaction.type) {
      case InteractionTypes.Ping: {
        return {
          type: InteractionResponseTypes.Pong,
        };
      }
      case InteractionTypes.ApplicationCommand: {
        const command:
          | ((i: DiscordInteraction) => DiscordInteractionResponse)
          | undefined = Reflect.getMetadata(
            `command:${interaction.data!.name}`,
            this,
          );
        if (!command) {
          return { error: "Command not found", status: 404 };
        }
        return command(interaction);
      }
      default: {
        return { error: "Command not found", status: 404 };
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
        return new Response(JSON.stringify({ error: body.error }), {
          status: body.status,
        });
      }
      const interaction: DiscordInteraction = JSON.parse(body);
      const response = this.handleInteraction(interaction);

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

const handler = new App().bootstrap();

await Deno.serve(handler).finished;
