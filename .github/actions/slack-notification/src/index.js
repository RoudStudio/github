import { getInput, setOutput, setFailed } from '@actions/core';
import { context } from '@actions/github';
import { WebClient } from '@slack/web-api';
import format from 'date-fns/format';

function buildSlackPayload({ status, color, url, actor }) {
  const { workflow } = context;
  const { owner, repo } = context.repo;

  const runId = parseInt(process.env.GITHUB_RUN_ID, 10);

  return {
    attachments: [
      {
        color,
        fallback: `${owner}/${repo} ${workflow} ${status}`,
        blocks: [
          {
            "type": "context",
            "elements": [
              {
                "type": "image",
                "image_url": "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
                "alt_text": "github logo"
              },
              {
                "type": "mrkdwn",
                "text": `<https://github.com/${owner}/${repo} | ${owner}/${repo}>  |  *${format(Date.now(), 'dd.MM.yyyy HH:mm:ss')}*`
              }
            ]
          },
          {
            "type": "divider"
          },
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": `*Workflow:* <https://github.com/${owner}/${repo}/actions/runs/${runId} | ${workflow}> \n *Initiated by:* ${actor || context.actor} \n *Status:* ${status} ${ url ? ` <${url} | Open>` : '' }`
            }
          }
        ],
      },
    ]
  };
}

function formatChannelName(channel) {
  return channel.replace(/[#@]/g, '');
}

(async () => {
  try {
    const channel = getInput('channel');
    const status = getInput('status');
    let color = getInput('color');
    const url = getInput('url');
    const messageId = getInput('message_id');
    const token = process.env.SLACK_BOT_TOKEN;
    const slack = new WebClient(token);

    switch(color) {
      case 'warning':
        color = '#ebc85d';
        break;
      case 'success':
        color = '#5db689';
        break;
      case 'danger':
        color = '#951d13';
        break;
    }

    if (!channel && !getInput('channel_id')) {
      setFailed(`You must provider either a 'channel' or a 'channel_id'.`);
      return;
    }

    const channelId = getInput('channel_id') || (await lookUpChannelId({ slack, channel }));

    if (!channelId) {
      setFailed(`Slack channel ${channel} could not be found.`);
      return;
    }

    const apiMethod = Boolean(messageId) ? 'update' : 'postMessage';

    const args = {
      channel: channelId,
      ...(buildSlackPayload({ status, color, url })),
    };

    if (messageId) {
      args.ts = messageId;
    }

    const response = await slack.chat[apiMethod](args);

    setOutput('message_id', response.ts);
  } catch (error) {
    setFailed(error);
  }
})();

async function lookUpChannelId({ slack, channel }) {
  let result;
  const formattedChannel = formatChannelName(channel);

  // Async iteration is similar to a simple for loop.
  // Use only the first two parameters to get an async iterator.
  for await (const page of slack.paginate('conversations.list', { types: 'public_channel, private_channel' })) {
    // You can inspect each page, find your result, and stop the loop with a `break` statement
    const match = page.channels.find(c => c.name === formattedChannel);
    if (match) {
      result = match.id;
      break;
    }
  }

  return result;
}
