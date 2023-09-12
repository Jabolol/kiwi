import "reflect-metadata";
import "$std/dotenv/load.ts";
import {
  DiscordInteraction,
  DiscordInteractionResponse,
  InteractionResponseTypes,
} from "discordeno";

import { Client, Command } from "~/utils.ts";

class App extends Client {
  constructor() {
    super();
  }

  @Command("hello")
  hello(interaction: DiscordInteraction): DiscordInteractionResponse {
    return {
      type: InteractionResponseTypes.ChannelMessageWithSource,
      data: {
        content: `Hello \`${interaction.member?.user.username}\`!`,
      },
    };
  }

  @Command("placeholder")
  async placeholder(
    interaction: DiscordInteraction,
  ): Promise<DiscordInteractionResponse> {
    const req = await fetch(
      `https://jsonplaceholder.typicode.com/todos/${interaction.data?.options
        ?.find(({ name }) => name === "id")?.value}`,
    );

    if (!req.ok) {
      return {
        type: InteractionResponseTypes.ChannelMessageWithSource,
        data: {
          content: `Something went wrong: \`${req.status}\``,
        },
      };
    }

    return {
      type: InteractionResponseTypes.ChannelMessageWithSource,
      data: {
        content: `\`\`\`json\n${
          JSON.stringify(await req.json(), null, 2)
        }\`\`\``,
      },
    };
  }
}

const handler = new App().bootstrap();

await Deno.serve(handler).finished;
