/**
 * Enhanced Customer Affirmation Slack Bot - Cloudflare Worker
 * Responds to /customer_affirm slash command with customer affirmations
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-www-form-urlencoded")) {
      return new Response("Invalid request format", { status: 400 });
    }

    // Helper function to get total count from KV
    async function getTotalCount() {
      return await getTotalCustomerAffirmationsShared();
    }

    // Helper function to get total count of customer affirmations from D1
    async function getCustomerAffirmationsCount() {
      try {
        const result = await env.CUSTOMER_AFFIRMATIONS_DB.prepare(
          "SELECT COUNT(*) as count FROM quotes"
        ).first();
        return result ? result.count : 0;
      } catch (error) {
        console.error(
          "Error getting customer affirmations count from D1:",
          error
        );
        return 0;
      }
    }

    // Helper function to get a random customer affirmation from D1
    async function getRandomCustomerAffirmation() {
      try {
        const result = await env.CUSTOMER_AFFIRMATIONS_DB.prepare(
          "SELECT text FROM quotes ORDER BY RANDOM() LIMIT 1"
        ).first();
        return result ? result.text : "I am grateful for your support.";
      } catch (error) {
        console.error(
          "Error getting random customer affirmation from D1:",
          error
        );
        return "I am grateful for your support.";
      }
    }

    // Helper function to get last N quotes with contributor
    async function getLastCustomerAffirmationsWithContributors(limit = 5) {
      try {
        const results = await env.CUSTOMER_AFFIRMATIONS_DB.prepare(
          `SELECT text, added_by_id, added_at FROM customer_affirmations ORDER BY added_at DESC LIMIT ?`
        )
          .bind(limit)
          .all();
        return results.results || [];
      } catch (error) {
        console.error(
          "Error getting last customer affirmations from D1:",
          error
        );
        return [];
      }
    }

    // Helper function to log a rayfirm share
    async function logCustomerAffirmationShare(userId) {
      try {
        await env.CUSTOMER_AFFIRMATIONS_DB.prepare(
          "INSERT INTO command_log (user_id, created_at) VALUES (?, datetime('now', 'utc'))"
        )
          .bind(userId)
          .run();
      } catch (error) {
        console.error("Error logging customer affirmation share:", error);
      }
    }

    // Helper function to get total customer affirmation shares from command_log
    async function getTotalCustomerAffirmationsShared() {
      try {
        const result = await env.CUSTOMER_AFFIRMATIONS_DB.prepare(
          "SELECT COUNT(*) as count FROM command_log"
        ).first();
        return result ? result.count : 0;
      } catch (error) {
        console.error(
          "Error getting total customer affirmation shares from command_log:",
          error
        );
        return 0;
      }
    }

    // Helper function to get top 3 Customer Affirmation Contributors
    async function getTopCustomerAffirmationContributors(limit = 3) {
      try {
        const results = await env.CUSTOMER_AFFIRMATIONS_DB.prepare(
          `SELECT user_id, COUNT(*) as count FROM command_log GROUP BY user_id ORDER BY count DESC LIMIT ?`
        )
          .bind(limit)
          .all();
        return results.results || [];
      } catch (error) {
        console.error(
          "Error getting top customer affirmation contributors from command_log:",
          error
        );
        return [];
      }
    }

    // Helper function to create stats blocks
    function createStatsBlocks(
      userName,
      totalShared,
      totalQuotes,
      lastQuotes = [],
      topCustomerAffirmationContributors = []
    ) {
      const blocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📊 Customer Affirmations Statistics",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text:
                "*Total Customer Affirmations Shared:* :chart_with_upwards_trend:\n`" +
                totalShared.toLocaleString() +
                "`",
            },
            {
              type: "mrkdwn",
              text:
                "*Available Customer Affirmations:* :customer_affirmation:\n`" +
                totalQuotes.toLocaleString() +
                "`",
            },
          ],
        },
      ];

      if (topCustomerAffirmationContributors.length) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `*Top 3 Customer Affirmation Contributors: :trophy:*
` +
              topCustomerAffirmationContributors
                .map(
                  (u, i) =>
                    `${i + 1}. <@${u.user_id}> — ${
                      u.count
                    } customer affirmations`
                )
                .join("\n"),
          },
        });
      }

      if (lastQuotes.length) {
        blocks.push({
          type: "divider",
        });
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Last 5 Added Customer Affirmations:* :new:",
          },
        });
        lastQuotes.forEach((q, i) => {
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${i + 1}. _${q.text}_  —  recorded by ${
                q.added_by_id === "system" ? "system" : `<@${q.added_by_id}>`
              }`,
            },
          });
        });
      }

      // Add instructions block
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: ':bulb: *To add a new customer affirmation, use:* `/customer_affirm add "Quote here"`',
        },
      });

      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Requested by @${userName}`,
          },
        ],
      });
      return blocks;
    }

    // Helper function to add new quote to database
    async function addNewQuote(quoteText, addedByUserId) {
      try {
        const result = await env.CUSTOMER_AFFIRMATIONS_DB.prepare(
          "INSERT INTO quotes (text, added_by_id, added_at) VALUES (?, ?, datetime('now', 'utc'))"
        )
          .bind(quoteText, addedByUserId)
          .run();
        return result.success;
      } catch (error) {
        console.error("Error adding new quote to D1:", error);
        return false;
      }
    }

    // Helper function to create customer affirmation blocks
    function createCustomerAffirmationBlocks(
      customerAffirmation,
      userName,
      totalCount
    ) {
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✨ ${customerAffirmation}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "🎲 Shuffle",
                emoji: true,
              },
              value: "shuffle",
              action_id: "shuffle_affirmation",
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "💫 Customer Affirmation",
                emoji: true,
              },
              value: customerAffirmation,
              action_id: "customer_affirmation_share",
              style: "primary",
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Requested by @${userName} • Total customer affirmations shared: ${totalCount}`,
            },
          ],
        },
      ];
    }

    try {
      const formData = await request.formData();
      const payload = formData.get("payload");

      if (payload) {
        const interactionData = JSON.parse(payload);
        console.log(
          "interactionData",
          JSON.stringify(interactionData, null, 2)
        );

        // Handle Slack URL verification (rare for interactions, but just in case)
        if (interactionData.type === "url_verification") {
          return new Response(interactionData.challenge, {
            headers: { "Content-Type": "text/plain" },
          });
        }

        // Handle interactive messages (button clicks)
        if (
          interactionData.type === "interactive_message" ||
          interactionData.type === "block_actions"
        ) {
          const action = interactionData.actions[0];
          const userName = interactionData.user.name;

          if (action.action_id === "shuffle_affirmation") {
            console.log("IS SHUFFLING");
            const newCustomerAffirmation = await getRandomCustomerAffirmation();
            const totalCount = await getTotalCount();

            // 2. Then, asynchronously POST to the response_url
            await fetch(interactionData.response_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                replace_original: true,
                text: "🎲 Shuffled! Here is a new customer affirmation.",
                blocks: createCustomerAffirmationBlocks(
                  newCustomerAffirmation,
                  userName,
                  totalCount
                ),
              }),
            });
          }

          if (action.action_id === "customer_affirmation_share") {
            console.log(
              "IS SHARING: response_url",
              interactionData.response_url
            );
            // Share the current customer affirmation with everyone
            const currentCustomerAffirmation = action.value;

            // Log the share in command_log
            await logCustomerAffirmationShare(interactionData.user.id);

            // Use the response_url to post in-channel
            await fetch(interactionData.response_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                delete_original: true,
                response_type: "in_channel",
                text: `${userName} customer affirmations: "${currentCustomerAffirmation}"`,
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `_${currentCustomerAffirmation}_`,
                    },
                  },
                  {
                    type: "context",
                    elements: [
                      {
                        type: "mrkdwn",
                        text: `Customer affirmed by <@${interactionData.user.id}>`,
                      },
                    ],
                  },
                ],
              }),
            });
          }
        }
        console.log("IS INTERACTION");
        // Return 200 OK for any unhandled interactions
        return new Response("OK", { status: 200 });
      } else if (formData.has("command")) {
        console.log("command", JSON.stringify(formData, null, 2));
        console.log("IS INITIAL COMMAND REQUEST");
        // Slash command
        const userName = formData.get("user_name") || "teammate";
        const userId = formData.get("user_id") || "unknown";
        const text = formData.get("text") || "";
        const quoteAuthor = formData.get("quote_author") || "";

        // Handle Slack's URL verification challenge (only needed during setup)
        const challenge = formData.get("challenge");
        if (challenge) {
          return new Response(challenge, {
            headers: { "Content-Type": "text/plain" },
          });
        }

        // Check if user wants to add a new quote
        if (text.trim().toLowerCase() === "new") {
          return Response.json({
            response_type: "ephemeral",
            text: '🤖 To add a new customer affirmation, please use the format:\n`/customer_affirm add "Your new quote here" "Your name here"`\n\nExample: `/customer_affirm add "TG is absolutely amazing!" "Jane Doe"`',
          });
        }

        // Check if user wants to add a new quote with the quote
        if (text.trim().toLowerCase().startsWith("add ")) {
          console.log("text", text);

          // More flexible quote parsing - handle different quote formats
          const addText = text.substring(4).trim(); // Remove "add " prefix
          console.log("addText", addText);

          let newQuote = "";

          // Try to extract quote from various formats
          if (addText.startsWith('"') && addText.endsWith('"')) {
            // Format: add "quote"
            newQuote = addText.slice(1, -1);
          } else if (addText.startsWith("'") && addText.endsWith("'")) {
            // Format: add 'quote'
            newQuote = addText.slice(1, -1);
          } else if (addText.includes('"')) {
            // Format: add "quote with spaces
            const firstQuote = addText.indexOf('"');
            const lastQuote = addText.lastIndexOf('"');
            if (firstQuote !== lastQuote) {
              newQuote = addText.substring(firstQuote + 1, lastQuote);
            }
            const quoteAuthor = addText.substring(firstQuote + 1, lastQuote);
          } else {
            // No quotes found, treat the whole text as the quote
            newQuote = addText;
          }

          // If extraction failed or resulted in empty string, use the whole addText
          if (!newQuote || newQuote.trim().length === 0) {
            newQuote = addText;
          }

          console.log("newQuote", newQuote);

          if (newQuote.length > 500) {
            return Response.json({
              response_type: "ephemeral",
              text: "🤖 Quote is too long. Please keep it under 500 characters.",
            });
          }

          const cleanedQuote = newQuote.replace(/["'""']/g, "").trim();

          const success = await addNewQuote(cleanedQuote, userId);

          if (success) {
            return Response.json({
              response_type: "ephemeral",
              text: `✅ Successfully added new customer affirmation!\n\n>${newQuote}\n\n:customer_affirmation:Thank you for contributing to the collection! ✨`,
              emoji: true,
            });
          } else {
            return Response.json({
              response_type: "ephemeral",
              text: "❌ Failed to add the quote. It might already exist in the database, or there was an error. Please try again.",
            });
          }
        }

        // Check if user wants stats
        if (text.trim().toLowerCase() === "stats") {
          const totalShared = await getTotalCustomerAffirmationsShared();
          const totalQuotes = await getCustomerAffirmationsCount();
          const lastQuotes = await getLastCustomerAffirmationsWithContributors(
            5
          );
          const topCustomerAffirmationContributors =
            await getTopCustomerAffirmationContributors(3);

          return Response.json({
            response_type: "ephemeral",
            text: `📊 Customer Affirmations Statistics\nTotal Shared: ${totalShared.toLocaleString()}\nAvailable Quotes: ${totalQuotes.toLocaleString()}`,
            blocks: createStatsBlocks(
              userName,
              totalShared,
              totalQuotes,
              lastQuotes,
              topCustomerAffirmationContributors
            ),
            emoji: true,
          });
        }

        // Get a random customer affirmation from D1
        const randomCustomerAffirmation = await getRandomCustomerAffirmation();

        // Get current total count
        const totalCount = await getTotalCount();

        return Response.json({
          response_type: "ephemeral", // Private message with buttons
          text: randomCustomerAffirmation,
          blocks: createCustomerAffirmationBlocks(
            randomCustomerAffirmation,
            userName,
            totalCount
          ),
        });
      } else {
        // Unknown POST
        return new Response("Unrecognized Slack request", { status: 400 });
      }
    } catch (error) {
      console.error("Error processing customer affirmation request:", error);

      return Response.json({
        response_type: "ephemeral", // Only visible to the user who ran the command
        text: "🤖 Oops! Something went wrong getting your customer affirmation. Ray would say 'We're gonna get through this!' 💪",
      });
    }
  },
};
