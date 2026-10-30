---
titre: Trusted cloud or on-premise hosting?
description: Hosting a sensitive application for the French State raises the same question every time. Here is how I prepare it for the decision-maker.
date: 2026-10-30
statut: valide
---

One question comes up in almost every project I run for the public sector: where should a sensitive application be hosted? Two answers usually come with it. The first is a SecNumCloud-qualified cloud. The second is an on-premise deployment, on the client's own premises and machines.

The question is often asked too early and in the wrong order. Offers get compared before anyone has described what needs protecting. My job as project manager is to put things back in order, then give the decision-maker a choice they can stand behind.

## Start from the data, not the offers

Before talking about hosting, I have three things described.

- **The data.** What is processed, and what the harm would be if it were disclosed, altered or unavailable. An application that books appointments does not call for the same measures as one that handles investigation data.
- **The obligations.** Some are set by law and policy. The French State's cloud doctrine, for instance, requires data of particular sensitivity to be hosted on a SecNumCloud-qualified cloud or on an internal State cloud. Classified information falls under a separate regime, which neither option settles on its own.
- **The threat.** Who might be interested in this data, and with what means. That is the purpose of the risk assessment, which I run using the EBIOS Risk Manager method.

These three elements often rule out one option before any comparison starts. When they do not, the comparison can begin on solid ground.

## What a SecNumCloud qualification guarantees

SecNumCloud is a qualification awarded by ANSSI, the French national cybersecurity agency, to cloud offers. It certifies that a provider meets a demanding framework: security of infrastructure and operations, data and operations located in Europe, and protection against foreign laws that could give access to the data.

It also has limits, and they need to be stated plainly.

- It covers the provider's offer, not the application. A poorly designed application remains vulnerable on a qualified cloud.
- It does not replace the security accreditation of the system, which remains the client's responsibility.
- The catalogue of qualified services is narrower than that of the large public clouds. Some managed services are not available, which affects both the architecture and the development cost.

## What an on-premise deployment costs

On-premise hosting gives the fullest control: the machines, the network and the people who access them all belong to the client. It is often the only option when the application has to run on an isolated network.

That control has a price, which does not always show in the first estimate.

- **Operations.** Teams are needed to administer, monitor, back up and patch, every day and for the whole life of the application.
- **Lead times.** Ordering and installing hardware takes months. A qualified cloud can be provisioned in days.
- **Capacity.** You size for the expected peak, and you pay for that capacity even when it sits idle.

## The criteria I put on the table

For each project, I compare the two options on the same criteria, which the decision-maker can weigh.

| Criterion                       | SecNumCloud-qualified cloud      | On-premise deployment             |
| ------------------------------- | -------------------------------- | --------------------------------- |
| Control over the infrastructure | Shared with a qualified provider | Full                              |
| Time to availability            | Short                            | Long, tied to hardware purchasing |
| Operations skills               | Mostly on the provider's side    | Entirely on the client's side     |
| Available services              | Qualified catalogue, narrower    | Whatever the team can operate     |
| Cost                            | Subscription, scaled to use      | Investment, then operations       |
| Isolated network                | Rarely possible                  | Possible                          |

The table does not give the answer. It makes the trade-offs visible, and that is what makes a decision possible.

## The forgotten criterion: reversibility

People think about moving in, rarely about moving out. Yet a hosting contract ends, a provider can lose its qualification, a need can change. So from the study onwards I ask how the data would be recovered, in what format, how long it would take and with which tools.

This question shapes the architecture. An application built on services specific to one provider will be hard to move. An application designed with standard components moves more easily, at the cost of a little more work at the start.

## What I hand to the decision-maker

At the end of the study, I hand over two documents. The first is complete: risk assessment, compared architectures, lifetime costs, migration roadmap. The second fits in a few pages: the two options, the risks that remain with each, and my reasoned recommendation.

The second document matters most. A programme director or a CIO does not need to become a hosting expert. They need to understand what they accept by choosing one option or the other, and to be able to explain it in turn.

Digital sovereignty is largely decided in these concrete choices, project after project. It calls for method more than grand statements: start from the data, say clearly what each option guarantees and what it does not, then let those whose decision it is decide.
