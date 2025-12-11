/**
 * Enhanced Customer Affirmation Slack Bot - Cloudflare Worker
 * Responds to /customer_love slash command with customer affirmations
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
          "SELECT text, text_author FROM quotes ORDER BY RANDOM() LIMIT 1"
        ).first();
        return result
          ? { text: result.text, text_author: result.text_author || null }
          : { text: "I am grateful for your support.", text_author: null };
      } catch (error) {
        console.error(
          "Error getting random customer affirmation from D1:",
          error
        );
        return { text: "I am grateful for your support.", text_author: null };
      }
    }

    // Helper function to get a customer affirmation by text (for sharing)
    async function getCustomerAffirmationByText(quoteText) {
      try {
        const result = await env.CUSTOMER_AFFIRMATIONS_DB.prepare(
          "SELECT text, text_author FROM quotes WHERE text = ? LIMIT 1"
        )
          .bind(quoteText)
          .first();
        return result
          ? { text: result.text, text_author: result.text_author || null }
          : null;
      } catch (error) {
        console.error(
          "Error getting customer affirmation by text from D1:",
          error
        );
        return null;
      }
    }

    // Helper function to get last N quotes with contributor
    async function getLastCustomerAffirmationsWithContributors(limit = 5) {
      try {
        const results = await env.CUSTOMER_AFFIRMATIONS_DB.prepare(
          `SELECT text, added_by_id, added_at FROM quotes ORDER BY added_at DESC LIMIT ?`
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

    // Helper function to log a customer affirmation share
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
                "*Total Quotes Shared in Slack:* :chart_with_upwards_trend:\n`" +
                totalShared.toLocaleString() +
                "`",
            },
            {
              type: "mrkdwn",
              text:
                "*Total Available Quotes:* :tg-heart:\n`" +
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
              `*Top 3 Customer Love users: :trophy:*
` +
              topCustomerAffirmationContributors
                .map(
                  (u, i) => `${i + 1}. <@${u.user_id}> — ${u.count} share(s)`
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
            text: "*Last 5 Added Customer Quotes:* :new:",
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
          text: ':bulb: *To add a new customer quote, use:* `/customer_love add "Quote here" "Name (email)"`',
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
    async function addNewQuote(quoteText, addedByUserId, textAuthor = null) {
      try {
        const result = await env.CUSTOMER_AFFIRMATIONS_DB.prepare(
          "INSERT INTO quotes (text, added_by_id, text_author, added_at) VALUES (?, ?, ?, datetime('now', 'utc'))"
        )
          .bind(quoteText, addedByUserId, textAuthor)
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
      // customerAffirmation can be either a string (legacy) or an object with text and text_author
      const affirmationText =
        typeof customerAffirmation === "string"
          ? customerAffirmation
          : customerAffirmation.text;

      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✨ ${affirmationText}`,
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
              value: affirmationText,
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
      const command = formData.get("command");

      // Log all form data keys for debugging
      const formDataKeys = [];
      for (const [key] of formData.entries()) {
        formDataKeys.push(key);
      }
      console.log("Form data keys:", formDataKeys);
      console.log("Has payload:", !!payload);
      console.log("Has command:", !!command);

      if (payload) {
        let interactionData;
        try {
          interactionData = JSON.parse(payload);
          console.log(
            "interactionData type:",
            interactionData.type,
            "Full data:",
            JSON.stringify(interactionData, null, 2)
          );
        } catch (parseError) {
          console.error("Error parsing payload JSON:", parseError);
          return Response.json(
            { error: "Invalid payload format" },
            { status: 400 }
          );
        }

        // Handle Slack URL verification (rare for interactions, but just in case)
        if (interactionData.type === "url_verification") {
          console.log("Handling URL verification");
          return new Response(interactionData.challenge, {
            headers: { "Content-Type": "text/plain" },
          });
        }

        // Handle interactive messages (button clicks)
        if (
          interactionData.type === "interactive_message" ||
          interactionData.type === "block_actions"
        ) {
          console.log("Handling block_actions/interactive_message");
          // Safety check for actions array
          if (!interactionData.actions || !interactionData.actions[0]) {
            console.error("No actions found in interaction data");
            return Response.json({});
          }

          const action = interactionData.actions[0];
          const userName = interactionData.user?.name || "teammate";

          if (action.action_id === "shuffle_affirmation") {
            console.log("IS SHUFFLING");

            // Return immediate acknowledgment to Slack (required within 3 seconds)
            // Then update the message asynchronously using response_url
            ctx.waitUntil(
              (async () => {
                try {
                  const newCustomerAffirmation =
                    await getRandomCustomerAffirmation();
                  const totalCount = await getTotalCount();

                  // POST to the response_url to update the message
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
                } catch (error) {
                  console.error("Error updating shuffle message:", error);
                }
              })()
            );

            // Return immediate empty response to acknowledge the interaction
            return Response.json({});
          }

          if (action.action_id === "customer_affirmation_share") {
            console.log(
              "IS SHARING: response_url",
              interactionData.response_url
            );
            // Share the current customer affirmation with everyone
            const currentCustomerAffirmationText = action.value;
            const userId = interactionData.user?.id || "unknown";
            const userName = interactionData.user?.name || "teammate";

            // Return immediate acknowledgment to Slack (required within 3 seconds)
            // Then update the message asynchronously using response_url
            ctx.waitUntil(
              (async () => {
                try {
                  // Log the share in command_log
                  await logCustomerAffirmationShare(userId);

                  // Get the quote with author information
                  const quoteData = await getCustomerAffirmationByText(
                    currentCustomerAffirmationText
                  );

                  // Build the context text
                  let contextText = `Requested by <@${userId}>`;
                  if (quoteData && quoteData.text_author) {
                    contextText = `By: ${quoteData.text_author} • Requested by <@${userId}>`;
                  }

                  // Use the response_url to post in-channel
                  await fetch(interactionData.response_url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      delete_original: true,
                      response_type: "in_channel",
                      text: `${userName} customer affirmations: "${currentCustomerAffirmationText}"`,
                      blocks: [
                        {
                          type: "section",
                          text: {
                            type: "mrkdwn",
                            text: `_${currentCustomerAffirmationText}_`,
                          },
                        },
                        {
                          type: "context",
                          elements: [
                            {
                              type: "mrkdwn",
                              text: contextText,
                            },
                          ],
                        },
                      ],
                    }),
                  });
                } catch (error) {
                  console.error("Error sharing customer affirmation:", error);
                }
              })()
            );

            // Return immediate empty response to acknowledge the interaction
            return Response.json({});
          }

          // If we get here, the action_id didn't match any handler
          console.warn("Unhandled action_id:", action.action_id);
          return Response.json({});
        }

        // If we get here, the interaction type didn't match block_actions or interactive_message
        console.warn("Unhandled interaction type:", interactionData.type);
        return Response.json({});
      } else if (command) {
        console.log("Handling slash command:", command);
        console.log("Command form data:", {
          command: formData.get("command"),
          text: formData.get("text"),
          user_name: formData.get("user_name"),
          user_id: formData.get("user_id"),
        });
        // Slash command
        const userName = formData.get("user_name") || "teammate";
        const userId = formData.get("user_id") || "unknown";
        const text = formData.get("text") || "";

        // Handle Slack's URL verification challenge (only needed during setup)
        const challenge = formData.get("challenge");
        if (challenge) {
          return new Response(challenge, {
            headers: { "Content-Type": "text/plain" },
          });
        }

        // Check if user wants help
        if (text.trim().toLowerCase() === "help") {
          return Response.json({
            response_type: "ephemeral",
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: ':bulb: *To add a new customer quote, use:* `/customer_love add "Quote here" "Name (email)"`',
                },
              },
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: `Requested by @${userName}`,
                  },
                ],
              },
            ],
          });
        }

        // Check if user wants to add a new quote
        if (text.trim().toLowerCase() === "new") {
          return Response.json({
            response_type: "ephemeral",
            text: '🤖 To add a new customer quote, please use the format:\n`/customer_love add "Your new quote here" "Name (email)"`\n\nExample: `/customer_love add "TG is absolutely amazing!" "Jimmy Donaldson (jimmy@someemail.com)"`',
          });
        }

        // Check if user wants to add a new quote with the quote
        if (text.trim().toLowerCase().startsWith("add ")) {
          console.log("Raw text from Slack:", JSON.stringify(text));
          console.log("text length:", text.length);
          console.log(
            "text char codes:",
            Array.from(text)
              .map((c) => `${c}:${c.charCodeAt(0)}`)
              .join(", ")
          );

          // More flexible quote parsing - handle different quote formats
          const addText = text.substring(4).trim(); // Remove "add " prefix
          console.log(
            "addText after substring(4).trim():",
            JSON.stringify(addText)
          );
          console.log("addText length:", addText.length);

          let newQuote = "";
          let textAuthor = null;

          // Function to parse quoted strings properly
          // Simple approach: find quoted strings and treat everything inside as one argument
          function parseQuotedStrings(input) {
            console.log("parseQuotedStrings input:", JSON.stringify(input));
            const results = [];
            let i = 0;
            const len = input.length;

            while (i < len) {
              // Skip whitespace between arguments
              while (i < len && /\s/.test(input[i])) {
                i++;
              }

              if (i >= len) break;

              const char = input[i];
              const charCode = input.charCodeAt(i);

              // Check if we're starting a quoted string
              // Support: " (34), ' (39), " (8220), " (8221), ' (8216), ' (8217)
              const isQuote =
                char === '"' ||
                char === "'" ||
                charCode === 8220 ||
                charCode === 8221 ||
                charCode === 8216 ||
                charCode === 8217;

              if (isQuote) {
                const openingQuoteCode = charCode;
                i++; // Skip opening quote
                let content = "";
                let escaped = false;

                // Read EVERYTHING until we find the matching closing quote
                // This includes spaces, parentheses, @ symbols, etc. - everything is one argument
                while (i < len) {
                  const currentChar = input[i];
                  const currentCharCode = input.charCodeAt(i);

                  if (escaped) {
                    // Handle escaped characters
                    content += currentChar;
                    escaped = false;
                    i++;
                  } else if (currentChar === "\\") {
                    // Next character is escaped
                    escaped = true;
                    i++;
                  } else {
                    // Check for matching closing quote
                    let isClosingQuote = false;
                    if (
                      (openingQuoteCode === 34 && currentCharCode === 34) ||
                      (openingQuoteCode === 8220 && currentCharCode === 8221) ||
                      (openingQuoteCode === 8221 && currentCharCode === 8221)
                    ) {
                      // Double quote variants
                      isClosingQuote = true;
                    } else if (
                      (openingQuoteCode === 39 && currentCharCode === 39) ||
                      (openingQuoteCode === 8216 && currentCharCode === 8217) ||
                      (openingQuoteCode === 8217 && currentCharCode === 8217)
                    ) {
                      // Single quote variants
                      isClosingQuote = true;
                    }

                    if (isClosingQuote) {
                      // Found the matching closing quote - this argument is complete
                      i++; // Skip closing quote
                      results.push(content);
                      console.log(`Extracted quoted argument: "${content}"`);
                      break;
                    } else {
                      // Regular character - add it to content (including spaces!)
                      content += currentChar;
                      i++;
                    }
                  }
                }

                // If we exited the loop without finding a closing quote, log a warning
                if (i >= len && content) {
                  console.warn(
                    `Warning: Unclosed quote detected. Content: "${content}"`
                  );
                  results.push(content);
                }
              } else {
                // Not a quoted string - skip this character and continue
                // (We only want to extract quoted arguments)
                i++;
              }
            }

            console.log("parseQuotedStrings results:", results);
            return results;
          }

          const parsedArgs = parseQuotedStrings(addText);
          console.log("parsedArgs", parsedArgs);
          console.log("parsedArgs length:", parsedArgs.length);
          console.log("parsedArgs[0]:", parsedArgs[0]);
          console.log("parsedArgs[1]:", parsedArgs[1]);

          if (parsedArgs.length >= 2) {
            // We have both quote and author
            newQuote = parsedArgs[0];
            textAuthor = parsedArgs[1];
            console.log(
              "Using both arguments - quote:",
              newQuote,
              "author:",
              textAuthor
            );
          } else if (parsedArgs.length === 1) {
            // Only one quoted string found - treat as quote
            newQuote = parsedArgs[0];
            console.log("Using single argument as quote:", newQuote);
          } else {
            // No quoted strings found, try the old parsing logic as fallback
            if (addText.startsWith('"') && addText.endsWith('"')) {
              newQuote = addText.slice(1, -1);
            } else if (addText.startsWith("'") && addText.endsWith("'")) {
              newQuote = addText.slice(1, -1);
            } else if (addText.includes('"')) {
              const firstQuote = addText.indexOf('"');
              const lastQuote = addText.lastIndexOf('"');
              if (firstQuote !== lastQuote) {
                newQuote = addText.substring(firstQuote + 1, lastQuote);
              }
            } else {
              newQuote = addText;
            }
          }

          // If extraction failed or resulted in empty string, use the whole addText
          if (!newQuote || newQuote.trim().length === 0) {
            newQuote = addText;
          }

          console.log("newQuote", newQuote);
          console.log("textAuthor", textAuthor);

          if (newQuote.length > 500) {
            return Response.json({
              response_type: "ephemeral",
              text: "🤖 Quote is too long. Please keep it under 500 characters.",
            });
          }

          // Remove all types of quotes (straight and curly) to ensure clean storage
          // This is a safety measure - the parser should already have removed them
          const quoteRegex = /[""'""''']/g;
          const cleanedQuote = newQuote.replace(quoteRegex, "").trim();
          const cleanedAuthor = textAuthor
            ? textAuthor.replace(quoteRegex, "").trim()
            : null;

          console.log(
            "After cleaning - quote:",
            cleanedQuote,
            "author:",
            cleanedAuthor
          );

          const success = await addNewQuote(
            cleanedQuote,
            userId,
            cleanedAuthor
          );

          if (success) {
            let successMessage = `✅ Successfully added new customer quote!\n\n>${newQuote}`;
            if (cleanedAuthor) {
              successMessage += `\n\nBy: ${cleanedAuthor}`;
            }
            successMessage += `\n\n:customer_affirmation: Thank you for contributing to the collection! ✨`;

            return Response.json({
              response_type: "ephemeral",
              text: successMessage,
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
            text: `📊 Customer Love Statistics\nTotal Shared: ${totalShared.toLocaleString()}\nAvailable Quotes: ${totalQuotes.toLocaleString()}`,
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
          text: randomCustomerAffirmation.text,
          blocks: createCustomerAffirmationBlocks(
            randomCustomerAffirmation,
            userName,
            totalCount
          ),
        });
      } else {
        // Unknown POST - log what we received
        console.error("Unrecognized Slack request - no payload or command");
        console.error("Form data keys:", formDataKeys);
        console.error(
          "Request headers:",
          Object.fromEntries(request.headers.entries())
        );

        // Return 200 to avoid Slack retries, but log the issue
        return Response.json(
          {
            error: "Unrecognized request format",
            received_keys: formDataKeys,
          },
          { status: 200 }
        );
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
