---
title: Assessing the Impact of AI on Sales Engineering Roles
published_at: '2026-03-10'
summary: The progress of artificial intelligence is changing everything we know at
  a pace never seen before. And yet the productivity boost we were all promised does
  not seem to be fully th...
status: draft
---

The progress of artificial intelligence is changing everything we know at a pace never seen before. And yet the productivity boost we were all promised does not seem to be fully there. Why is that?

From developers claiming their roles have fundamentally changed, to companies struggling to adopt AI at scale, there seems to be a large gap between potential and reality.

I want to share my view on where this gap comes from and what might be missing. To do that, I will look at my own profession and examine what needs to happen for AI to truly drive productivity.

## Exposure to Artificial Intelligence

If you worry about this topic, you are not alone. A growing amount of research is trying to measure the impact of AI on the workforce. Microsoft, for example, published the paper *Measuring the Applicability of Generative AI to Occupations*, while organizations such as the International Labour Organization released a *Refined Global Index of Occupational Exposure to Generative AI*.

Most of these studies share a methodology that I find particularly useful: analyzing tasks within jobs rather than the jobs themselves.

By decomposing a role into individual tasks, we remove much of the emotional burden from the discussion. Instead of asking whether a profession disappears, we ask a more practical question: which parts of the work can be automated, augmented, or transformed?

The approach is simple:

1. Decompose the role into tasks

2. Evaluate AI capabilities

3. Assess the impact

Earlier research gives us a useful starting point. The 2013 paper *The Future of Employment* framed automation concerns well before the generative AI breakthrough. More recent studies attempt to refine these predictions using updated datasets and better modeling.

Still, depending on the assumptions, research often paints contradictory pictures. More importantly, many of these models struggle to reflect the reality engineers experience in 2026. That is why running this exercise ourselves can be helpful.

## Sales engineering in the cloud era

Before evaluating the impact of AI, it helps to clarify what sales engineering actually means.

The role appears in companies selling complex solutions, often in a B2B context. Simple products rarely require explanation, but modern digital platforms, cloud services, and security technologies are much harder to adopt without technical guidance.

Coca-Cola does not require architectural discussions. A distributed data platform usually does.

Sales engineering exists at the intersection of technical expertise and revenue generation. While the sales representative focuses on commercial aspects, the sales engineer helps customers understand the technology, design solutions, and successfully implement them.

In the cloud industry this role becomes even more important. Cloud services follow a subscription model, meaning success is not defined only by the initial sale. Customers must continue to use and derive value from the platform.

In other words, convincing the customer is not enough — they must remain successful long after the contract is signed.

In practice, the work of a cloud sales engineer revolves around three broad areas.

- **Customer engagement**. Sales engineers are often the main technical contact for customers, running discovery workshops, discussing architecture, and occasionally helping when things go wrong.
- **Technical advisory.** We design solutions, demonstrate product capabilities, and frequently assist customers in building proof-of-concept environments.
- **Advocacy**. We scale our impact by delivering presentations, publishing technical content, and building reusable assets that help the broader sales organization.

The exact balance between these activities depends on the company and the customer profile. Still, three tasks consistently stand out as the most impactful in day-to-day work:

- running discovery workshops

- demonstrating proof of value through demos or proof of concepts

- helping customers overcome technical challenges

Before analyzing these tasks individually, it helps to define how AI typically affects work.

Across most research and industry discussions, AI impact generally falls into three categories.

- **Automation** replaces repetitive tasks.
- **Augmentation** improves productivity while humans remain responsible.
- **Transformation** changes how the task itself is performed

Using these categories, we can estimate the impact of AI on the core tasks of a cloud sales engineer.

## AI impact assessment on key tasks

TaskAutomationAugmentationTransformationRun discovery workshopsLowHighMediumDemonstrate proof of value (demos / PoCs)MediumHighMediumHelp customers overcome technical challengesLowHighMedium

Remember, automation refers to tasks that AI can perform with minimal human intervention. Augmentation describes situations where AI enhances productivity while humans remain responsible. Transformation occurs when AI changes the workflow itself, enabling faster iteration or new approaches.

For cloud sales engineering, the pattern is clear: AI augments far more than it replaces.

Running discovery workshops illustrates this well. These meetings are often the first deep interaction between a customer and a technical representative of the vendor. The goal is not only to identify technical challenges but also to establish trust.

AI already helps significantly with preparation. It can summarize previous interactions, analyze the customer’s industry, suggest discovery questions, and highlight potential architecture patterns. During and after the meeting it can also capture notes, summarize decisions, and generate follow-up actions.

But the core interaction remains human. Discovery workshops involve navigating organizational dynamics, interpreting ambiguous answers, and understanding constraints that may not be explicitly stated. Stakeholders may have conflicting priorities or political considerations that only emerge during conversation. AI can assist, but the trust-building component still relies heavily on human interaction.

Demonstrating proof of value is another area where AI shows strong potential. In cloud environments, value is rarely communicated through slides alone. Customers want to see working systems.

Demos and proof-of-concept environments allow them to validate assumptions and understand how a solution might work in practice. Preparing these environments often involves repetitive setup work: generating datasets, building infrastructure, writing scripts, and documenting architecture.

AI can significantly accelerate this preparation. It can generate architecture diagrams, infrastructure templates, example datasets, and even full demo scenarios. Engineers still need to validate the design and align it with the customer’s environment, but the experimentation cycle becomes much faster.

Helping customers overcome technical challenges is another core responsibility of the role. Eventually every customer encounters obstacles: deployments fail, architectures do not scale as expected, or security policies block otherwise straightforward implementations.

AI can assist engineers by analyzing logs, searching documentation, proposing troubleshooting steps, and identifying configuration patterns. For well-documented issues, the time required to reach a solution can drop dramatically.

However, real production environments are rarely simple. Problems usually involve multiple systems and constraints specific to the customer’s architecture. Engineers still need to validate suggestions, understand trade-offs, and adapt solutions to the context.

The main change is speed. AI reduces the time needed to explore possible solutions, but the final judgment remains human.

## A real-life example

To make this discussion less theoretical, it helps to look at a concrete example.

Recently, a potential customer was exploring a migration from their on-premises infrastructure to Oracle Cloud Infrastructure. Their environment was complex and required several iterations of meetings, explanatory emails, and data collection. We needed exports of their virtualized environments, software versions, operating systems, hardware sizing, and other configuration details.

During preparation for the initial call, AI did not add much value. There were no industry-specific constraints to research and the focus was mostly on understanding the existing environment.

Things started to change after the first meeting.

Once the customer mentioned technologies I was less familiar with, such as MonetDB, and specific limitations involving Elasticsearch features and PostgreSQL plugins, the advantage of AI became obvious. Research that would normally take days was reduced to hours. Instead of scheduling the follow-up meeting for the next week, we were able to meet again the following day.

Of course, ideas that look good on paper still need validation. Tools such as Cline, together with models like Codex and Opus, helped me spin up working environments extremely quickly. Migration strategies could be tested rather than simply discussed. For example, it was my first time attempting a migration from Elasticsearch to OpenSearch while dealing with version constraints. With AI assistance, I was able to prototype and validate the approach in less than a working day.

Preparing the customer presentation meant consolidating everything: documenting the findings, preparing a tailored demo, and ensuring a working environment was ready to showcase the migration path. A few additional hours were enough to be customer-ready.

The overall engagement lasted two to three weeks due to asynchronous communication with the customer. But if I look strictly at the focused engineering time, I estimate it required no more than sixteen hours.

My rough productivity estimates were the following:

ActivityEstimated productivity boostResearch and documentation analysis3–4×Customer communicationNo measurable improvementArchitecture design, deployment and validation3–4×Documentation and deliverables5–6×This is obviously a personal and approximate estimate, but it suggests that AI allowed me to compress roughly a week and a half of work into two focused working days.

Beyond time savings, there was also a qualitative improvement. Scripts, documentation, and deliverables were likely better structured and more complete than what I would normally produce under similar time pressure.

## Final thoughts

Looking at these tasks individually reveals an interesting pattern.

AI does not remove the need for cloud sales engineers. Instead, it changes how we work. Much of the repetitive preparation, research, and documentation can now be automated or significantly accelerated.

What remains is the part of the job that is harder to replace: understanding customer context, navigating trade-offs, and building trust.

In that sense, AI may not eliminate the role. But it will almost certainly raise expectations for what a good engineer can deliver.

The real shift is not from humans to AI. It is from engineers working alone to engineers working alongside AI systems that amplify their capabilities.
