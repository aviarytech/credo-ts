import { Agent, AriesFrameworkError, HttpOutboundTransporter, InboundTransporter } from '../../src'
import { getBaseConfig, sleep, waitForBasicMessage } from '../../src/__tests__/helpers'
import logger from '../../src/__tests__/logger'
import { get } from '../http'

const aliceConfig = getBaseConfig('E2E Alice', { mediatorUrl: 'http://localhost:3001' })
const bobConfig = getBaseConfig('E2E Bob', { mediatorUrl: 'http://localhost:3002' })

describe('with mediator', () => {
  let aliceAgent: Agent
  let bobAgent: Agent
  let aliceAtAliceBobId: string

  afterAll(async () => {
    ;(aliceAgent.inboundTransporter as PollingInboundTransporter).stop = true
    ;(bobAgent.inboundTransporter as PollingInboundTransporter).stop = true

    // Wait for messages to flush out
    await new Promise((r) => setTimeout(r, 1000))

    await aliceAgent.closeAndDeleteWallet()
    await bobAgent.closeAndDeleteWallet()
  })

  test('Alice and Bob make a connection with mediator', async () => {
    aliceAgent = new Agent(aliceConfig)
    aliceAgent.setInboundTransporter(new PollingInboundTransporter())
    aliceAgent.setOutboundTransporter(new HttpOutboundTransporter(aliceAgent))
    await aliceAgent.init()

    bobAgent = new Agent(bobConfig)
    bobAgent.setInboundTransporter(new PollingInboundTransporter())
    bobAgent.setOutboundTransporter(new HttpOutboundTransporter(bobAgent))
    await bobAgent.init()

    const aliceInbound = aliceAgent.routing.getInboundConnection()
    const aliceInboundConnection = aliceInbound?.connection
    const aliceKeyAtAliceMediator = aliceInboundConnection?.verkey
    logger.test('aliceInboundConnection', aliceInboundConnection)

    const bobInbound = bobAgent.routing.getInboundConnection()
    const bobInboundConnection = bobInbound?.connection
    const bobKeyAtBobMediator = bobInboundConnection?.verkey
    logger.test('bobInboundConnection', bobInboundConnection)

    // TODO This endpoint currently exists at mediator only for the testing purpose. It returns mediator's part of the pairwise connection.
    const mediatorConnectionAtAliceMediator = JSON.parse(
      await get(`${aliceAgent.getMediatorUrl()}/api/connections/${aliceKeyAtAliceMediator}`)
    )
    const mediatorConnectionAtBobMediator = JSON.parse(
      await get(`${bobAgent.getMediatorUrl()}/api/connections/${bobKeyAtBobMediator}`)
    )

    logger.test('mediatorConnectionAtAliceMediator', mediatorConnectionAtAliceMediator)
    logger.test('mediatorConnectionAtBobMediator', mediatorConnectionAtBobMediator)

    expect(aliceInboundConnection).toBeConnectedWith(mediatorConnectionAtAliceMediator)
    expect(bobInboundConnection).toBeConnectedWith(mediatorConnectionAtBobMediator)
  })

  test('Alice and Bob make a connection via mediator', async () => {
    // eslint-disable-next-line prefer-const
    let { invitation, connectionRecord: aliceAgentConnection } = await aliceAgent.connections.createConnection()

    let bobAgentConnection = await bobAgent.connections.receiveInvitation(invitation)

    aliceAgentConnection = await aliceAgent.connections.returnWhenIsConnected(aliceAgentConnection.id)

    bobAgentConnection = await bobAgent.connections.returnWhenIsConnected(bobAgentConnection.id)

    expect(aliceAgentConnection).toBeConnectedWith(bobAgentConnection)
    expect(bobAgentConnection).toBeConnectedWith(aliceAgentConnection)

    // We save this verkey to send message via this connection in the following test
    aliceAtAliceBobId = aliceAgentConnection.id
  })

  test('Send a message from Alice to Bob via mediator', async () => {
    // send message from Alice to Bob
    const aliceConnectionAtAliceBob = await aliceAgent.connections.getById(aliceAtAliceBobId)

    logger.test('aliceConnectionAtAliceBob\n', aliceConnectionAtAliceBob)

    const message = 'hello, world'
    await aliceAgent.basicMessages.sendMessage(aliceConnectionAtAliceBob, message)

    const basicMessage = await waitForBasicMessage(bobAgent, {
      content: message,
    })

    expect(basicMessage.content).toBe(message)
  })
})

class PollingInboundTransporter implements InboundTransporter {
  public stop: boolean

  public constructor() {
    this.stop = false
  }
  public async start(agent: Agent) {
    await this.registerMediator(agent)
  }

  public async registerMediator(agent: Agent) {
    const mediatorUrl = agent.getMediatorUrl()

    if (!mediatorUrl) {
      throw new AriesFrameworkError(
        'Agent has no mediator URL. Make sure to provide the `mediatorUrl` in the agent config.'
      )
    }

    const mediatorInvitationUrl = await get(`${mediatorUrl}/invitation`)
    const { verkey: mediatorVerkey } = JSON.parse(await get(`${mediatorUrl}/`))
    await agent.routing.provision({
      verkey: mediatorVerkey,
      invitationUrl: mediatorInvitationUrl,
    })
    this.pollDownloadMessages(agent)
  }

  private async pollDownloadMessages(agent: Agent) {
    while (!this.stop) {
      await agent.routing.downloadMessages()
      await sleep(5000)
    }
  }
}
