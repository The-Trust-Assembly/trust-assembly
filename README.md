# Project Magic Glasses

## Meeting Schedule

We meet on Wednesdays from 4pm PST to 5pm PST on Google Meet

Link to Thursday Meeting: https://calendar.app.google/Pq7BYSLfwYvCwKBF7

## Background

You can read more about the project on my substack at the following links

- [A Boring Utopia](https://extelligence.substack.com/p/introduction-to-a-boring-utopia)

- [How to Make an Information Super Weapon](https://extelligence.substack.com/p/how-to-make-an-information-super)

## Problem Statement

As decentralized content creators and news organizations capture greater
market share of online news consumers, consensus reality is becoming harder to achieve and has fractured the cultural understanding of basic truths.

As AI develops and gives individuals the ability to produce this content at scale, this problem will only grow worse. A scalable decentralized editor is needed in order to create a healthy, trustworthy online media environment.

## What is a Trust Assembly?

At a high level, a Trust Assembly is a decentralized editorial process for
the internet. More specifically, the Trust Assembly is two things:

1. A process of adjudication whereby two or more parties can conduct an adversarial review of online material to present evidence, assess truth claims, and appeal to neutral parties to determine which side has presented the “best fit” explanation.

2. A mechanism to take the outcomes produced in the first step and present them in plain view of an online content consumer without need for them to do additional research to understand their in-group or cross-group consensus except at choice. It delivers an easy and shareable method for users to see “the truth” right next to the distortion without having to perform a deeper review except at choice.

A user of the Trust Assembly should feel that they have a pair of magical glasses that allows them to see through “spin” or “noise” as they browse the internet. The user should feel the same way about the news content they consume that they would feel if they went to purchase a car at a car lot with their expert mechanic father and financial genius mother. No trust relationship is forced and the user has a good understanding of why they should trust what they see.

## Mission Statement

Our mission is to build a minimum viable Trust Assembly so that we can launch either a non-profit organization or a start-up to pursue funding and scale this technology as quickly as possible. This decision will be made depending on what is most likely to achieve the overall goals of the
project.

## Goals

1. Create at minimum a browser extension capable of inserting the headline and content edits produced by the Trust Assembly to show the full power of the system. We will call this “Magic Glasses.”

2. Give users of the system the ability to follow trusted organizations or individuals who create the content.

3. Create a wiki-like user interface to guide the adjudication process and house the outcomes in a database for use by the browser extension.

4. Create a decision engine to do some low-level reputation scoring process

5. Create policy documents around notoriety rules (what material can be adjudicated?) process rules (what are the rules of evidence) procedure rules (how can evidence be discussed, etc) and the jury empanelment (how we will decide who gets to decide the winners of various contests)

## Our Principles

1. We are the creators and guardians of a process, not the proponents of a particular outcome of that process. We do not put our thumbs on the scale and we let the chips fall as they may.

2. We are content contextualizers not content destroyers. Whatever content we add context to, the original content should always be visible to the user, even if buried behind some number of clicks.

3. We are open and transparent about our changes and we never hide our interventions. Users must always be able to tell that we have inserted edits into their content feed, regardless of what UI they are using.

4. Nullius in verba, or “Take no one at their word for it.” Whenever we make changes we must also provide a link to the wiki where the adjudication work was completed.

5. We are economizers of thinking and trust. No one has the ability to deeply research every news item they come across. We enable individuals to share the outcomes of their research with others who have decided to trust them.

6. Trust must be given, it cannot be forced. We enable the codification of trust relationships, but we do not force trust or “nudge” users without their explicit consent to view certain content as trustworthy or not trustworthy.

7. We believe in the presumption of innocence and due process. Wherever we build a process or a flow, we must place the burden of proof and any processing costs on the person making the accusation. This includes the costs of the defense of the content from the accusation. We presume the person being accused has certain inalienable rights, such as the right to make a defense of their content and their freedom of conscience to disagree with the outcome.

8. Reputation is slow to build, and fast to lose. As we work to economize knowledge creation and sharing, we will rely on reputation. Reputation is relative to group.  As individuals prove themselves more and more trustworthy within a group, their associated costs to use the system should slowly and steadily decrease as their reputation slowly and steadily increases. However, if any wrong-doing is found, reputation must be quickly lost.

9. We believe in forgiveness. Honest errors occur and we should incentivize people to quickly admit wrongdoing without negative consequences.

10. We believe in consequences. Repeated deliberate untruth, deception, or misleading content, should be punished for the sake of the commons. We should not force ourselves to repeatedly give second, third, fourth, and fifth chances to proven liars without imposing increased costs. Our systems should be fair and rules known and never applied retroactively, but as individuals prove themselves untrustworthy they should bear the consequences of having that known and having their content moved further out of the direction attention of our users.

11. Truth is a direction, not a destination. Truth exists, it is perfect and eternal, but humans are not. We approach truth but there is no perfect process to arrive at truth. We approach truth humbly. Even the scientific method, based on the consensus of experiments, can be misinterpreted or suffer from bad design. Truth is not final in our system but it is assumed to exist and as an item survives greater and greater scrutiny, we economize this reality by imposing greater and greater costs to adjudicate that truth. Only the truth has the ability to survive infinite scrutiny. Extraordinary claims require extraordinary evidence.

12. Money flows first to incentivize the creation of honesty and trust. As we build the system and explore new revenue streams, we must remember that to keep our overall trust environment healthy that money must flow first to the users of the system as soon as the basic needs of the system are cared for.

## Our Roadmap

### Phase 1: Headline Automation and Database Creation (We are Here)

Use an LLM and samples of writing from various creators to create an automated headline replacer.

Scrape text from some predetermined sites, such as CNN, Fox, MSNBC, etc.

Feed this text to an LLM with prompts designed by a specific content creator to produce a new headline and store this in a database.

Use the browser extension to replace the old headline with the new headline.

Scope will be small so we could even start with just those three websites or even only one as a demonstration. Use the text to generate a new headline and store this in a back-end database. Build a chrome extension that takes the new headline and replaces it with appropriate UI changes to make the editing visible to the end-user.

As soon as we have something to show, we can email a bunch of news folks and ask them if they are interested. Parallel to that effort, we can use those commitments to seek some funding for the project.

### Phase 2: Editing and Forum Creation

Before we go live to end-users we need to build in a basic level of editing ability for headlines. Say the LLM gets it wrong, which will definitely happen. If you’re one of the initial system contributors now you have brand damage. So the initial contributors would need the ability to edit the headline. However, as stated previously, justification has to be given. So we need to build both the edit ability and repository/wiki-like forum for that justification to be housed as we build out discussion.

The purpose of the wiki is to eventually serve as the repository of all evidence associated with changes made to a specific URL.

As this continues, we would expand the number of sites being scraped and automated but still on a fixed list to control costs and complexity. We would also in parallel expand the number of contributors with deliberate efforts made to create diverse polities within the network.

### Phase 3: In-Line Edits and Annotations

Expand the editing abilities to include in-article edits and annotations with the appropriate UI displays. In parallel to this, give the contributors the ability to delegates his authority out to other users within their polity. I think this is the best way to start building out the user-base initially. It will evolve as the system evolves but we want heavily engaged epistemology nerds for our first users.

The Wiki will be built our in parallel to support this. We will need strong rules on editing, role, etc.

At this point, we can also bring in people who have specific issue focus that have a strong desire to refute specific pieces of information that mainstream media gets wrong or does a poor job on.

### Phase 4: Group Sharing, Group Conflict, Group Adjudication

At this point, we would hopefully have enough people for this to be worthwhile. Plans never work out exactly the way you’d hope, but I like to have stuff written down. Give groups the ability to “inherit” the notes of other groups if they seem superior. It will all have to be gate-kept initially by the first contributors and their delegates but we want to start building that functionality out. So the group leader would have the ability to do something like say “Inherit all the notes of this group.” We also want groups to be able to find other notes at this point, a sort of “view all mode” for contributors, and then argue them publicly. This would expand our wiki-like database for this activity and help us build out functionality there. We could also get additional influencers who work in debate style formats interested at this point. We can let people argue it out on YouTube, via text, etc. But we might get more attention if there are high profile arguments on X or on Substack, etc. Enable the basic jury functionality to work asynchronously. Depending on how many people we have it might be the case we need to let the arguments happen and wait to get the response back.

### Phase 5: Open Onboarding, Open the Adding Additional Sites

This is the point where we have enough “stuff” that we can meaningfully add people without having to vet them first. Let them create their own groups without having to go through us, etc. We would also want to build out flexibility so that someone could add any site to the automation list or automate any site not in our preset list. There might still need to be some limiters here and we would work it out depending on volumes, but balance here is that we want people to be able to argue for the truth but we don’t want to become Orwellian and rain on the parade of someone’s uncle who thinks Hillary Clinton is a warlock and has 12 followers, three of which are his own alts.

### Phase 6: Reputation

Add reputation to all the groups, contributors, etc. There are so many ways to do this but basically, I want to just try different scoring methods and get large groups of people to look at them and vote on which one looks right. The whole point of the system is to create something people trust and that looks right to them. This is also where we are going to start posting policies, do outreach to professional associations, etc. For instance, ghost editing articles is just a terrible practice. That’s where someone publishes something, is called out for a mistake, then fixes it but doesn’t note the article that they made the edit later. That’s obviously wrong. We need a rule book somewhere around these practices.

At all times, I also want to make sure that we incentivize people to be honest about making mistakes and fixing them in a reasonable amount of time. I don’t want to drop a hammer on someone unless they’re really asking for it.

## How we plan to make money

1. Fundraising to get off the ground, either Non Profit or VC, still tbd

2. Processing fee from the adjudication costs once the system is monetized

3. Money from parking the money for the adjudication process, interest on CD’s etc.

4. API access once the system is built out, for anyone who wants to inherit our knowledge artifacts to implement their own version of the Trust Assembly UI. Our hope is that this is eventually a service used by social media companies and most newspapers.

5. Licensing of the data to AI companies for training

6. With a lot of hand waving that could be its own document, advertising based on the same kind of adjudication process, like consumer reports. This is not high on my priority list to pursue.

## Common Concerns

### It sounds like we could be making very strong filter bubbles here. What gives?

We need to start building the system, and you’re right. In the very first phases, before conflict can start in earnest, this is going to create filter bubbles. Our job is to proceed through that phase as quickly as possible to get to the point that anyone can be challenged. We should try not to acquire a lot of users until we get to the point we have challenge built-in. As soon as we can, we will start popping filter bubbles.

### What if I don’t believe in your principles but still want to contribute?

Our goal here is to build an enlightenment style governance layer for the internet. Insofar as you think we are falling short of that mark, please let me know. Insofar as you are opposed to that goal, you should probably not work on the project.

### What gives on not knowing it’s going to be a non for profit or a start-up?

I had hoped to start this project several months in the future after I had time to think about this more, but when one is linked by Scott Alexander and gets offers of help, one moves as the times allow. I’m on paternity leave and at about the same time Scott linked to me I had a second child. I have not ever built a start-up before or an NGO. My highest concern is that we build something that serves the goals of the organization and we’ll need to follow whatever the path is that allows us to do that. We are also approaching a somewhat frightening AI future that will likely need this tool very quickly and if we find ourselves going down that route it might be that a start-up helps us prevent it more quickly. This will all have to be felt out with potential funders. I don’t feel great about this either and am actively trying to read up on this and see if I can get enough smarts to point at one and determine best approach. If you have input, please provide it.

### So what would you do with the money after I put in all this work?

I would try to be fair to everyone who has contributed to the system and provide compensation, but in all honesty my first priority is the system itself. The system has to exist before we really have anything at all. A lot of this will depend on the funding. If I get enough money to fairly compensate you, I will gladly do so and that would make me happy. If I don’t get enough to do that, I can’t. You should operate under the assumption that I won’t be able to, but know that I am fighting for it as quickly as I can. At anything less than funding sufficient to leave my regular job and pursue this full time, my intention isn’t to pay myself anything unless the hour commitment becomes so high my wife will get angry at me if I don’t. Even then, I would pay you first. I will of course vouch for anyone who contributes and provide positive references for having done so.

### Dude, what’s with the personal stories on your substack?

I genuinely don’t think this project would have the attention it does if I hadn’t posted those. I was internet famous for that stuff a long while back but stopped because it felt kind of uncomfortable to put myself out there in that way. People like drama and not so much consensus making mechanism stuff. It helps me raise my profile and bring awareness of the system. Oddly, Scott liked one and linked to the project so the plan worked. I’m doing it now to keep building out attention and revenue for the project. We don’t have a ton of money coming in from that now, but we definitely have a trickle. Note, I don’t have a close relationship with Scott or anything. He has linked to my twice now but I don’t want you to think I’m trading on his name or that he has made any promises of support or anything like that.

## How can I help?

Just start doing something. I’m a momentum first leader. The pieces will fall into place. Tell me who you are and what you can do and we’ll find a place for you on the team. We have weekly meetings as you see above. Join one, let me know who you are, and we will figure it out.

## Who are you?

My name is Andrew.  I am a VP at a large financial institution. I’m a Product Owner over several different processes, although my title keeps changing as I become in charge of more and more stuff. I’m primarily a business guy but I can understand tech speak. I’m not a coder but I can do a pretty okay systems diagram. I became interested in impacts from journalism because I grew up in a community heavily impacted by the Spotted Owl Controversy, which was from our perspective radically oversimplified.

## How can I get ahold of you?

Just message me on discord. I have two children I’m watching the majority of the day so my hours are odd. I’m usually most easily freed up between 1am and 5am PST. I don’t think many of you will want to meet during that time but if you do, let me know. I also have some time from 9pm to 10pm, possibly. If you ever need my cell number just ask for it, but communication may be a bit asynchronous. I will go back to work in January so I’m trying to make as much progress as possible until then.

## Project Layout

This is a monorepo, containing a browser extension, [Deno](https://deno.com/) backend, React frontend, and a Python CLI interface for headline transformation.

Directory structure:

- apps - Applications for user interface
  - browser-extension - browser extension
  - webapp - Deno + React application
    - api - Deno backend serving the Wiki and the browser extension
      - db - Database migrations and seed data. Uses the [Nessie database interface](https://deno.land/x/nessie@2.0.11)
- headline-transform - A Python CLI that calls an LLM to transform headlines. This is built as an executable in the docker image and called from the Deno backend.
- infra - Infrastructure (not used yet)

## Running locally with Docker

Install [Docker](https://docs.docker.com/get-docker/) and [docker-compose](https://docs.docker.com/compose/install/) on your local machine.

To build and run the Docker container for the first time, run:

```bash
docker-compose -f docker-compose.dev.yml --profile seed up --build
```

This will build the Docker image and run the container. The `--profile seed` flag is used to populate the database with initial data. You can omit this flag on subsequent runs.

TODO: set up live reload when making changes to the code. Right now, you will have to rebuild the Docker image and restart the container when making changes.

Confirm the container is running by visiting `http://localhost:5173` in your browser. Confirm the database is connected to the backend and seeded with data by visiting `http://localhost:5173/api/db-test`.

## Browser extension development

For instructions on how to develop the browser extension, refer to the [README.md](apps/browser-extension/README.md) file in the `apps/browser-extension` directory.
