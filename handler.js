'use strict';

const https = require('https');
const crypto = require('crypto');
const url = require('url');

// Commentary and postComment func modified from code by
// https://github.com/christo4ferris/dco-check-bot/blob/master/bot.js (Apache 2.0)
// Contacted Christopher Ferris
/*
Copyright 2015 Christopher Ferris

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const dco_not_found = '\n\nPlease submit commits with a Signed-off-by statement in order to allow us to process your pull request.';
const dnf_tail =` For example a comment on the last line of your request like this:
\`Signed-off-by: Bob Boberton <bob.boberton@example.com>\`
Please use a valid e-mail with the comment. These commands may be useful:
\`\`\`
git commit --amend --signoff
\`\`\`
or
\`\`\`
git filter-branch -f --commit-filter 'git commit-tree -S "$@"' HEAD
\`\`\`
`;
const dco_found = '\n\nI can confirm that a sign-off has been included. It is okay to process this pull request.';
const greeting = 'Hi ';
const thanks = ',\n\nThanks for submitting this pull request!';
const signature = '\n\ndco-bot';

const regex = /Signed-off-by: .*<[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}>$/im;
const regexPath = /[^/]*$/;

const optionsTemplate = {
  hostname: 'api.github.com',
  method: 'POST',
  headers: {
    'User-Agent': 'dco-bot',
    Authorization: `token ${process.env.GITHUB_SECRET}`,
  },
};
function deleteComments(payload, callback) {
  const options = Object.assign({}, optionsTemplate, {
    path: url.parse(payload.pull_request.comments_url).pathname,
    method: 'GET',
  });
  const req = https.request(options, (res) => {
    let comments = '';
    res.on('data', (chunk) => {
      comments += chunk;
    });
    res.on('end', () => {
      let commentsObj = JSON.parse(comments);
      commentsObj = commentsObj.filter((a) => {
        const body = a.body.split('\n');
        return body[body.length - 1] === 'dco-bot';
      });

      for (const comment of commentsObj) {
        const options2 = Object.assign({}, optionsTemplate, {
          path: url.parse(comment.url).pathname,
          method: 'DELETE',
        });
        const req2 = https.request(options2);
        req2.end();
      }
      callback();
    });
  });
  req.end();
}

function postComment(payload, msg, callback) {
  const tmp = {};
  tmp.body = greeting + payload.pull_request.user.login + thanks + msg + signature;
  const postData = JSON.stringify(tmp);
  const options = Object.assign({}, optionsTemplate, {
    path: url.parse(payload.pull_request.comments_url).pathname,
  });
  console.log(`posting to: ${payload.pull_request.comments_url} data: ${postData}`);
  const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    if (res.statusCode !== 201) {
      console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    }
    res.on('end', () => {
      console.log('Returning callback');
      callback(null,
        { statusCode: 200,
          body: `Comment complete: ${payload.pull_request.comments_url}` });
    });
  });
  req.on('error', (e) => {
    console.log(`unable to post comment: ${e.message}`);
    const errMsg = `[502] Unable to post comment: ${e.message}`;
    callback(new Error(errMsg));
  });
  req.end(postData);
}

// Used as inspiration (CC BY 4.0)
// © 2015 Jeff Squyres <jeff@squyres.com>
// http://www.slideshare.net/jsquyres/fun-with-github-webhooks-verifying-signedoffby
function getCommits(payload, msg, callback) {
  let goodChain = true;
  const options = Object.assign({}, optionsTemplate, {
    path: url.parse(payload.pull_request.commits_url).pathname,
    method: 'GET',
  });
  console.log(`COMMITS: ${payload.pull_request.commits_url}`);
  const req = https.get(options, (res) => {
    let commitBody = '';
    console.log(`STATUS: ${res.statusCode}`);
    if (res.statusCode !== 200) {
      console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    }
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      commitBody += chunk;
    });
    res.on('end', () => {
      const commits = JSON.parse(commitBody);
      const body = {
        target_url: 'https://github.com/deptofdefense/code.mil',
        description: 'All commits up to this point been signed off.',
        context: 'DCO',
      };
      let badSha;
      const path = url.parse(payload.pull_request.statuses_url).pathname.replace(regexPath, '');
      for (const commit of commits) {
        const options2 = Object.assign({}, optionsTemplate, { path: path + commit.sha });
        const bodyLines = commit.commit.message.split('\n');
        const sigLine = bodyLines[bodyLines.length - 1]; // Perhaps it can occur anywhere?
        const req2 = https.request(options2, () => {
          req2.on('error', (e) => { console.log('error: ', e); });
        });
        if (regex.test(sigLine) && (goodChain || (commit !== commits[commits.length - 1]))){
          console.log('Setting ', commit.sha, ' to success.');
          body.state = 'success';
        } else {
          goodChain = false;
          badSha = badSha || commit.sha;
          console.log('Setting ', commit.sha, ' to error.');
          body.state = 'error';
          body.description = `A commit (${badSha}) is not signed off.`;
        }
        req2.end(JSON.stringify(body));
      }

      if (goodChain) {
        postComment(
          payload,
          dco_found, callback);
      } else {
        postComment(
          payload,
          dco_not_found + dnf_tail, callback);
      }
    });
  });
  req.on('error', (e) => {
    console.log(`[502]: Unable to retrieve commits: ${e.message}`);
  });
}

function signRequestBody(key, body) {
  return `sha1=${crypto.createHmac('sha1', key).update(JSON.stringify(body)).digest('hex')}`;
}

module.exports.dcobot = (event, context, callback) => {
// Mangled and modified (unknown license) from
// https://raw.githubusercontent.com/serverless/examples/master/aws-node-github-webhook-listener/handler.js
  let errMsg;
  const token = process.env.GITHUB_WEBHOOK_SECRET;
  const headers = event.headers;
  const sig = headers['X-Hub-Signature'];
  const githubEvent = headers['X-GitHub-Event'];
  const id = headers['X-GitHub-Delivery'];
  const calculatedSig = signRequestBody(token, event.body );
  if (typeof token !== 'string') {
    errMsg = '[401] must provide a \'GITHUB_WEBHOOK_SECRET\' env variable';
    return callback(new Error(errMsg));
  }
  if (!sig) {
    errMsg = '[401] No X-Hub-Signature found on request';
    return callback(new Error(errMsg));
  }
  if (!githubEvent) {
    errMsg = '[422] No X-Github-Event found on request';
    return callback(new Error(errMsg));
  }
  if (!id) {
    errMsg = '[401] No X-Github-Delivery found on request';
    return callback(new Error(errMsg));
  }
  if (sig !== calculatedSig) {  // not equal time compare?
    errMsg = '[401] X-Hub-Signature incorrect. Github webhook token doesn\'t match';
    return callback(new Error(errMsg));
  }
  // event.body = JSON.parse(event.body); Not needed with serverless libraries.
  console.log(`Github-Event: "${githubEvent}" with action: "${event.body.action}"`);

  if (event.body.action !== 'opened' && event.body.action !== 'reopened' && event.body.action !== 'synchronize') {
    errMsg = `[202] No action required for ${event.body.action}`;
    return callback(new Error(errMsg));
  }
  deleteComments(event.body, () => {
    getCommits(event.body, '', callback);
  });
  return callback(null, { statusCode: 200, body: `Success: ${JSON.stringify(event.body)}` });
};

