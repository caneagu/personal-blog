---
title: How AI changes the sales engineering role
published_at: '2026-03-09'
summary: The progress of Artificial Intelligence is changing everything we know at
  a pace never seen before. And yet the productivity boost we were all promised does
  not seem to be fully th...
status: draft
---

The progress of Artificial Intelligence is changing everything we know at a pace never seen before. And yet the productivity boost we were all promised does not seem to be fully there. Why is that?

From developers claiming their roles have fundamentally changed, to companies struggling to adopt artificial intelligence at scale, there seems to be a large gap between potential and reality.

I want to share my view on where this gap comes from and what might be missing. To do that, I will look at my own profession and examine what needs to happen for AI to truly drive productivity.

## Exposure to Artificial Intelligence

If you worry about this topic, you are not alone. A critical mass of interest has led companies such as Microsoft to publish research like “Measuring the Applicability of Generative AI to Occupations”, among many other papers referenced below.

Most of these studies share a similar methodology, and it is one I find particularly useful: analyzing tasks within jobs rather than the jobs themselves.

By decomposing a role into individual tasks, we remove much of the emotional burden. It allows us to stay objective. This might feel impersonal, but that is actually helpful when we are evaluating the possibility that parts of our work may eventually be automated.

The methodology is simple:

1. Decompose the role into tasks

2. Evaluate AI capabilities

3. Assess the impact

Earlier research gives us a starting point. For example, The Future of Employment paper published in 2013 framed automation concerns well before the generative AI breakthrough. More recently, the International Labour Organization released a Refined Global Index of Occupational Exposure to Generative AI, providing a more updated picture.

These studies rely on large datasets and careful analysis. Yet research often paints contradictory pictures depending on assumptions and models. More importantly, many of these frameworks struggle to fully reflect the reality of 2026. This is why it is useful to run this exercise ourselves.

## Sales Engineering Tasks

Before evaluating the impact of AI, it helps to clarify what sales engineering actually means.

The term can take different shapes depending on the industry. In general, sales engineering exists in companies selling complex solutions, often in a B2B environment. While simple products can be purchased easily, more complex technologies require technical guidance before customers can extract value. Coca-Cola does not need much explanation. A modern cloud platform or a cybersecurity solution, on the other hand, does.

Revenue ultimately comes from sales, which explains the name. Similar titles such as presales, solutions consulting, or customer engineering describe closely related roles. In simple terms, a **sales engineer is the technical counterpart to the sales representative, helping customers understand, adopt, and succeed with a product or service**.

In the cloud industry, this role becomes even more critical. Cloud services follow a subscription model, meaning success is not defined only by the initial sale. Customers must continue to use and derive value from the platform. And this require a sustained effort.

In other words, convincing the customer is not enough — they must remain successful and happy long after the contract is signed.

From my personal experience, the role revolves around three broad categories of activities.

- **Customer engagement**. Sales engineers are often the main technical contact for customers. This includes discovery workshops, architecture discussions, and sometimes troubleshooting when things go wrong.

- **Technical advisory**. We help architect solutions, demonstrate product capabilities, and often assist customers in building proof-of-concept environments.

- **Advocacy**. We scale knowledge by delivering presentations, publishing technical content, or building reusable assets that help the broader sales organization.

All of these activities matter. Their relative importance changes depending on the company, the product, and the customer profile.

However, if I had to choose the three tasks that have the most impact in practice, they would be:

- Running effective discovery workshops

- Demonstrating proof of value through demos or proof of concepts

- Helping customers overcome technical challenges

Before looking at each task individually, it is useful to define how AI can affect work. Across most research and industry discussions, AI impact generally falls into three categories.

- **Automation** means AI replaces repetitive tasks.
- **Augmentation** means AI improves productivity while humans remain responsible.
- **Transformation** means AI fundamentally changes how the task is performed.

For simplicity, later in the article I will evaluate each task using **Low**, **Medium**, or **High** impact across these categories.

## Running Effective Discovery Workshops

Discovery workshops are one of the most important interactions between a customer and a sales engineer. Beyond the obvious goal of identifying technical challenges and opportunities, these meetings also serve another purpose: establishing trust early in the relationship.

Customers expect their technical counterpart to demonstrate expertise, ask the right questions, and understand the broader context of their business.

AI has **strong augmentation potential in this area**. Before a workshop, AI can help with researching the customer’s industry, summarizing previous interactions, generating discovery questions, and identifying potential architecture patterns. During or after the meeting, AI can assist by capturing meeting notes, summarizing decisions, and highlighting follow-up actions.

However, the core interaction itself remains human. Discovery workshops involve navigating organizational dynamics, interpreting ambiguous answers, and understanding context that is often not written anywhere. Stakeholders may have conflicting priorities or hidden constraints that only emerge through conversation.

AI can assist with preparation and analysis, but the **trust-building component remains largely human-driven**.

## Demonstrating Proof of Value (Demos and Proof of Concepts)

In cloud environments, value is rarely communicated through slides alone. Customers want to see the technology working. This is where demos and proof of concepts become critical. They allow customers to validate assumptions and understand how a solution might work in their own environment.

**AI can significantly accelerate this process**. For demos, AI can help generate architecture diagrams, example datasets, demo scripts, and synthetic workloads. Preparing a demonstration often involves repetitive setup work. AI-assisted tools can dramatically reduce the time required to prepare these environments.

For proof of concepts, AI can assist engineers in generating infrastructure templates, troubleshooting configuration issues, exploring alternative architectures, and analyzing performance or cost implications.

This does not remove the need for human expertise. A successful proof of concept still requires aligning technical decisions with customer constraints such as security policies, internal processes, and operational practices.

What AI changes is the **speed of experimentation**. Engineers can move faster from idea to implementation.

## Helping Customers Overcome Technical Challenges

Eventually, every customer encounters obstacles. A deployment might fail. An architecture might not scale as expected. Security requirements might block an otherwise straightforward solution.

This is where the sales engineer often shifts from advisor to problem solver.

AI can significantly assist in this phase. Engineers can use AI systems to analyze logs and error messages, search documentation faster, propose troubleshooting steps, and identify configuration patterns. For well-documented issues, AI can dramatically reduce the time required to locate relevant information.

However, real-world technical problems are rarely simple. Issues often involve multiple systems, incomplete information, and constraints that are specific to the customer’s environment. Human engineers still play a critical role in validating AI suggestions, understanding the broader architecture, and adapting solutions to the customer’s reality.

The biggest impact here is speed. AI helps engineers reach potential solutions faster, but the final judgment remains human.

## AI Impact Assessment on Key Sales Engineering Tasks

Remember, automation refers to tasks that AI can perform with minimal human intervention. Augmentation describes situations where AI enhances productivity while humans remain responsible. Transformation occurs when AI changes how the task is performed, enabling new workflows or faster iterations.

TaskAutomationAugmentationTransformationRun discovery workshopsLowHighMediumDemonstrate proof of value (demos / PoCs)MediumHighMediumHelp customers overcome technical challengesLowHighMedium**

In the case of cloud sales engineering, the pattern is quite clear: AI augments far more than it replaces**.

## Real-life experience

To make this discussion less theoretical, I want to share a recent project and my own rough estimate of the productivity boost AI provided.

A potential customer was exploring a migration from their on-premises infrastructure to Oracle Cloud Infrastructure. Their environment was fairly complex and required several iterations of customer meetings, explanatory emails, and data collection. We needed exports of their virtualized environments, software versions, operating systems, hardware sizing, network design and other configuration details.

During the preparation for the initial call, AI did not add much value. There were no industry-specific considerations and the conversation mostly focused on understanding the environment and gathering information.

Things started to change after the first meeting.

Once the customer mentioned technologies I was less familiar with, such as MonetDB, and specific restrictions in their deployments involving Elasticsearch features and PostgreSQL plugins, the advantage of AI became obvious. **Research that would normally take days was reduced to hours**. Instead of scheduling the follow-up meeting for the following week, we were able to meet again the next day.

Of course, things that look good on paper still need to be validated. Tools like Cline together with Codex and Opus models helped me spin up fully working environments and experiment quickly. Migration strategies were tested and validated after deeper research. For example, it was my first time attempting a migration from Elasticsearch to OpenSearch while dealing with version constraints. With AI assistance, I was able to **prototype and validate the approach in less than a working day**.

Preparing the final customer presentation meant bringing everything together: documenting the findings, preparing a tailored demo, and ensuring a live environment was ready to showcase the migration strategy. With a few additional hours of preparation, the material was ready for the customer discussion.

The engagement itself lasted two to three weeks due to asynchronous communication with the customer. However, if I look strictly at the actual work required without noise and distrations, I estimate it took **no more than sixteen hours**.

My rough productivity estimates for this engagement would be the following:

ActivityEstimated productivity boostResearch and documentation analysis3–4×Customer communicationNo tangible improvementArchitecture design, deployment and validation3–4×Documentation and deliverables5–6×**

Keeping in mind that this is a personal and approximate estimate, I believe AI allowed me to compress roughly a week and a half of work into two focused working days**.

Beyond the time savings, there was also a qualitative improvement. The scripts, documentation, and deliverables produced during the engagement were likely better structured and more complete than what I would normally prepare under similar time constraints.

## Closing thought

Looking at these tasks individually reveals an interesting pattern. AI does not remove the need for cloud sales engineers; instead, it changes how we work.

Much of the repetitive preparation, documentation, and research can be automated or accelerated. What remains is the part of the job that is harder to replace: understanding customers, making architectural trade-offs, and building trust.

In that sense, AI may not eliminate the role. But it will likely raise the expectations for what a good engineer can deliver.

The real shift is not from humans to AI. It is from engineers working alone to engineers working alongside AI systems that amplify their capabilities.
