import "$std/dotenv/load.ts";

const COMMANDS = [
  {
    type: 1,
    name: "hello",
    description: "Says hi back!",
    dm_permission: false,
    nsfw: false,
  },
  {
    type: 1,
    name: "create",
    description: "Create a giveaway!",
    dm_permission: false,
    "options": [
      {
        type: 3,
        name: "prize",
        description:
          "The prize of the giveaway (supports markdown syntax highlighting)",
        required: true,
      },
      {
        type: 3,
        name: "duration",
        description: "The relative duration of the giveaway such as 1h 20m",
        required: true,
      },
      {
        type: 3,
        name: "message",
        description: "A place to put conditions, terms, FAQs",
        required: true,
      },
      {
        type: 3,
        name: "image",
        description: "A URL to the image to be shown (changes the embed color)",
      },
      {
        type: 4,
        name: "winners",
        description: "The amount of winners, defaults to 1",
      },
    ],
    nsfw: false,
  },
];

if (!import.meta.main) {
  console.log("This module is not meant to be imported.");
  Deno.exit(1);
}

await COMMANDS.reduce(async (prms, cmd) => {
  await prms;
  const response = await fetch(
    `https://discord.com/api/v10/applications/${
      Deno.env.get("CLIENT_ID")
    }/commands`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${Deno.env.get("BOT_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    },
  );

  if (!response.ok) {
    return console.error(await response.json());
  }
  console.log(`successfully registered ${cmd.name}.`);
  await new Promise((resolve) => setTimeout(resolve, 1e3));
}, Promise.resolve());
