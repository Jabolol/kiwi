import "reflect-metadata";
import "$std/dotenv/load.ts";
import {
  ButtonStyles,
  DiscordEmbed,
  DiscordInteraction,
  DiscordInteractionResponse,
  DiscordMessage,
  InteractionResponseTypes,
  MessageComponentTypes,
} from "discordeno";
import parse from "parse-duration";
import probe from "probe-image-size";
import { createCanvas, loadImage } from "canvas";
import { get_color_thief as getColor } from "color-thief";

import { Button, Client, Command } from "~/utils.ts";
import { GiveawayMeta } from "~/types.ts";

const kv = await Deno.openKv();

class App extends Client {
  constructor(protected kv: Deno.Kv) {
    super();
  }

  async computeColor(url: string): Promise<number> {
    const { width: w, height: h } = await probe(url);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    const image = await loadImage(url);

    ctx.drawImage(image, 0, 0);

    const { data } = ctx.getImageData(0, 0, w, h);
    const [[r, g, b]] = getColor(new Uint8Array(data), data.byteLength, 10, 2);
    const color = (r << 16) + (g << 8) + b;

    return color;
  }

  getInput<T>(key: string, interaction: DiscordInteraction) {
    const elem = interaction.data?.options?.find((o) => o.name === key);
    if (!elem) {
      return null;
    }
    return interaction.data?.options?.find((o) => o.name === key)?.value as T;
  }

  async createGiveaway(interaction: DiscordInteraction) {
    const image = this.getInput<string>("image", interaction);
    const color = image
      ? await this.computeColor(image)
      : +(0x36393e).toString(10);
    const prize = this.getInput<string>("prize", interaction)!;
    const duration = parse(this.getInput<string>("duration", interaction)!);
    const winners = this.getInput<number>("winners", interaction) || 1;
    const description = this.getInput<string>("message", interaction)!;

    if (!duration) {
      return {
        type: InteractionResponseTypes.ChannelMessageWithSource,
        data: { content: "Invalid duration", flags: 1 << 6 },
      };
    }

    const embed: DiscordEmbed = {
      description:
        `Click the button and have a chance to win:\n\`\`\`md\n${prize}\n\`\`\``,
      color,
      fields: [{
        name: "Hosted by",
        value: `<@${interaction.member?.user.id}>`,
        inline: true,
      }, {
        name: "Ends",
        value: `<t:${((new Date().getTime() + duration) / 1e3).toFixed(0)}:R>`,
        inline: true,
      }, {
        name: "Winners",
        value: `\`${winners}\` ${winners > 1 ? "people" : "person"}`,
        inline: true,
      }, {
        name: "Message",
        value: `> ${description}`,
        inline: false,
      }],
      title: "New giveaway!",
    };

    await fetch(
      `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${Deno.env.get("BOT_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: `Giveaway created at <#${interaction.channel_id}>!`,
          flags: 1 << 6,
        }),
      },
    );

    const message = await fetch(
      `https://discord.com/api/v10/channels/${interaction.channel_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${Deno.env.get("BOT_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          embeds: [image ? { ...embed, image: { url: image } } : embed],
          components: [
            {
              type: MessageComponentTypes.ActionRow,
              components: [{
                type: MessageComponentTypes.Button,
                label: "",
                emoji: {
                  id: "1151164303483863211",
                  name: "giveaway",
                },
                style: ButtonStyles.Primary,
                custom_id: `action_${interaction.id}`,
              }, {
                type: MessageComponentTypes.Button,
                label: "info",
                emoji: {
                  id: "1151164307334250546",
                  name: `people`,
                },
                style: ButtonStyles.Secondary,
                custom_id: `info_${interaction.id}`,
              }],
            },
          ],
        }),
      },
    );

    if (!message.ok) {
      throw new Error("Failed to create giveaway");
    }

    const { id }: DiscordMessage = await message.json();

    const config: GiveawayMeta = {
      prize,
      startedAt: new Date(),
      endsAt: new Date(Date.now() + duration),
      winners,
      participants: [],
    };

    await this.kv.set([`giveaway`, `${interaction.id}`], config);
    await this.kv.enqueue(`${interaction.id}:${interaction.channel_id}:${id}`, {
      delay: duration,
      keysIfUndelivered: [["error"]],
    });
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

  @Command("create")
  create(interaction: DiscordInteraction): DiscordInteractionResponse {
    setTimeout(() => this.createGiveaway(interaction), 1e3);
    return {
      type: InteractionResponseTypes.DeferredChannelMessageWithSource,
      data: { flags: 1 << 6 },
    };
  }

  @Button("action")
  async action(
    interaction: DiscordInteraction,
  ): Promise<DiscordInteractionResponse> {
    const label = interaction.data?.custom_id;
    const interactionId = label?.split("_")[1]!;
    const { value } = await this.kv.get<GiveawayMeta>([
      `giveaway`,
      interactionId,
    ]);

    if (!value) {
      return {
        type: InteractionResponseTypes.ChannelMessageWithSource,
        data: {
          content: "Giveaway not found",
          flags: 1 << 6,
        },
      };
    }

    const isParticipant = value.participants.some(
      ({ id }) => id === interaction.member?.user.id,
    );

    if (isParticipant) {
      value.participants = value.participants.filter(
        ({ id }) => id !== interaction.member?.user.id,
      );
      await this.kv.set([`giveaway`, interactionId], value);

      return {
        type: InteractionResponseTypes.ChannelMessageWithSource,
        data: {
          content: "You have left this giveaway",
          flags: 1 << 6,
        },
      };
    }

    value.participants.push({
      id: interaction.member?.user.id!,
      username: interaction.member?.user.username!,
    });

    await this.kv.set([`giveaway`, interactionId], value);

    return {
      type: InteractionResponseTypes.ChannelMessageWithSource,
      data: {
        content: "You have entered the giveaway!",
        flags: 1 << 6,
      },
    };
  }

  @Button("info")
  async info(
    interaction: DiscordInteraction,
  ): Promise<DiscordInteractionResponse> {
    const label = interaction.data?.custom_id;
    const interactionId = label?.split("_")[1]!;
    const { value } = await this.kv.get<GiveawayMeta>([
      `giveaway`,
      interactionId,
    ]);

    return {
      type: InteractionResponseTypes.ChannelMessageWithSource,
      data: {
        content: value?.participants.length
          ? `## people participating:\n${value?.participants.map(({ id }) =>
            `* <@${id}>`
          ).join(
            "\n",
          )}`
          : `No one is participating yet`,
        flags: 1 << 6,
      },
    };
  }

  static async handleQueue(msg: unknown) {
    if (typeof msg !== "string") {
      throw new Error("Invalid message");
    }

    const [interaction, channel, message] = msg.split(":");
    const { value } = await kv.get<GiveawayMeta>([`giveaway`, interaction]);

    if (!value) {
      return;
    }

    const winners = value.participants.map((a) => ({
      sort: Math.random(),
      value: a,
    })).sort((a, b) => a.sort - b.sort).map((a) => a.value).slice(
      0,
      value.winners,
    );

    const original = await fetch(
      `https://discord.com/api/v10/channels/${channel}/messages/${message}`,
      {
        headers: {
          Authorization: `Bot ${Deno.env.get("BOT_TOKEN")}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!original.ok) {
      await kv.delete([`giveaway`, interaction]);
      throw new Error("Failed to fetch original message");
    }

    const {
      embeds: [embed],
      components,
    }: DiscordMessage = await original.json();

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channel}/messages/${message}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${Deno.env.get("BOT_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          embeds: [{
            ...embed,
            title: "Giveaway ended!",
            fields: embed.fields?.map((f) => {
              if (f.name === "Winners") {
                return {
                  ...f,
                  value: winners.length
                    ? winners.map(({ id }) => `<@${id}>`).join("\n")
                    : "`No winners`",
                };
              }
              if (f.name === "Ends") {
                return {
                  ...f,
                  name: "Ended",
                };
              }
              return f;
            }),
          }],
          components: components!.map((c) => ({
            ...c,
            components: c.components.map((b) => ({
              ...b,
              disabled: true,
            })),
          })),
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to edit message");
    }

    await kv.delete([`giveaway`, interaction]);
  }

  static init() {
    kv.listenQueue(this.handleQueue);
    return new App(kv);
  }
}

const client = App.init();
const handler = client.bootstrap();

await Deno.serve(handler).finished;
