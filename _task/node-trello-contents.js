const querystring = require('querystring');
const path = require('path');
const fs = require('fs');

const fetch = require('node-fetch');
const dotenv = require('dotenv');
const minimist = require('minimist');
const opts = minimist(process.argv.slice(2));

dotenv.config();

// Configuration
/// Trello API URL
const TRELLO_API_URL_PREFIX = "https://api.trello.com/1/lists/";

/// Configure Trello API Client
const TRELLO_API = {
	access_token_key: process.env.TRELLO_API_TOKEN_KEY,
	access_token_secret: process.env.TRELLO_API_TOKEN_SECRET
};

/// Configure list. Our list is "Curated"
const TRELLO_FE_WEEKLY_LIST = process.env.TRELLO_FE_WEEKLY_LIST;

/// Posts location
const POSTS_DIR = path.resolve(process.env.PWD, 'src/posts');

// Helper functions
/// Helper Function to return unknown errors
const handleError = err => {
	console.error(err);
	process.exit(1);
};

/// Generate querystring for Trello cards API
const params = () => {
	return querystring.stringify({
		attachments: true,
		card_attachment_fields: "url",
		fields: "id,name,desc",
		key: TRELLO_API.access_token_key,
		token: TRELLO_API.access_token_secret
	});
};

/// Prepare 11ty's Template Data
const prepareTemplateData = (response) => {
	// Strip URL and /n from desc
	const removeNoise = value => {
		const regex = /(\\n|\\r)|http(s):\/\/\S*/gm;
		return value.replace(regex, '').trim();
	};

	const transformCallBack = (accumulator, currentElement) => {
		const transform = {
			...currentElement,
			desc: removeNoise(currentElement.desc),
			attachments: currentElement.attachments[0].url
		};

		// Return the value for the next step by using the array from the previous step and
		// replace desc and attachments
		return [...accumulator, transform];
	};

	return response.reduce(transformCallBack, []);
};

/// Fetch cards from Trello
const getCards = async () => {
	try {
		const response = await fetch(`${TRELLO_API_URL_PREFIX}${TRELLO_FE_WEEKLY_LIST}/cards?${params()}`, {
			"method": "GET"
		});

		return prepareTemplateData(await response.json());
	} catch (err) {
		handleError(err);
	}
};

/// option handler
const optionHandler = () => {
	// If opts.vol isn't passed then exit
	if (!opts.vol) {
		handleError(`opts.vol is REQUIRED. Please add post vol using the '--vol=' parameter`);
	}

	// If opts.date isn't passed then exit
	if (!opts.date) {
		handleError(`opts.date is REQUIRED. Please add post vol using the '--date=YYYY-MM-DD' parameter`);
	}

	return opts;
};

/// Generate a post file
const generatePost = tmplData => {
	const options = optionHandler();

	const makeTitle = vol => `title: Vol.${vol}`;
	const makeDate = date => `date: '${date}'`;
	const makeDesc = () => `desc: '3 OF TRANSLATED TITLE、ほか計${tmplData.length}リンク'`;

	const frontMatter = () => `---
${makeTitle(options.vol)}
${makeDate(options.date)}
${makeDesc()}
---
`;

	const description = element => element ? element : `FILL ME`;

	// A typical post would look like this:
	// ## [${Title}(${Link})
	// #### ${Translated Title}
	// ${Excerpt}
	// ↑ We will have 3 of this.
	const makeFeatured = element => `## [${element.name}](${element.attachments})
#### TRANSLATED TITLE
${description(element.desc)}

`;

	// ## [${Title}(${Link})
	// ${Excerpt}
	// ↑ We will have 4 of this.
	const makeOtherInterested = element => `## [${element.name}](${element.attachments})
${description(element.desc)}

`;

	// In Brief heading
	const makeInBriefHeading = () => `# In Brief`;

	// InBrief is
	// - **[${Title}(${Link})]**: ${Translated Title}
	// ↑ We will have 5 of this.
	const makeInBrief = element => `- **[${element.name}(${element.attachments})**: TRANSLATED TITLE
`;

	const glue = () => {
		const featured = tmplData.slice(0, 3).map(elements => makeFeatured(elements)).join('');
		const other = tmplData.slice(3, 7).map(elements => makeOtherInterested(elements)).join('');
		const inBrief = tmplData.slice(7).map(elements => makeInBrief(elements)).join('');

		return `${frontMatter()}
${featured}
${other}
${makeInBriefHeading()}
${inBrief}`;
	};

	return glue();
};

/// Save post as md
const savePost = post => {
	const options = optionHandler();

	try {
		fs.writeFileSync(`${POSTS_DIR}/${options.date}-v${options.vol}.md`, post,'utf-8');
	} catch (err) {
		handleError(err);
	}
};

// Main Function
async function main() {
	const tmplData = await getCards();
	const post = generatePost(tmplData);
	savePost(post);
}

main();