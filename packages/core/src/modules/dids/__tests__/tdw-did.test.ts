import type { AgentContext } from '../../../agent'
import type { Wallet } from '../../../wallet'

import { Subject } from 'rxjs'

import { InMemoryStorageService } from '../../../../../../tests/InMemoryStorageService'
import { InMemoryWallet } from '../../../../../../tests/InMemoryWallet'
import { getAgentConfig, getAgentContext } from '../../../../tests/helpers'
import { EventEmitter } from '../../../agent/EventEmitter'
import { InjectionSymbols } from '../../../constants'
import { Key, KeyType } from '../../../crypto'
import { JsonTransformer, TypedArrayEncoder } from '../../../utils'
import { DidsModuleConfig } from '../DidsModuleConfig'
import {
  DidCommV1Service,
  DidDocument,
  DidDocumentBuilder,
  convertPublicKeyToX25519,
  getEd25519VerificationKey2018,
  getX25519KeyAgreementKey2019,
} from '../domain'
import { DidDocumentRole } from '../domain/DidDocumentRole'
import { TdwDidResolver } from '../methods'
import { DidKey } from '../methods/key'
import { didDocumentJsonToNumAlgo1Did } from '../methods/peer/peerDidNumAlgo1'
import { DidRecord, DidRepository } from '../repository'
import { DidResolverService } from '../services'

import didPeer1zQmY from './__fixtures__/didPeer1zQmY.json'

describe('tdw dids', () => {
  const config = getAgentConfig('TDW DIDs Lifecycle')

  let didRepository: DidRepository
  let didResolverService: DidResolverService
  let wallet: Wallet
  let agentContext: AgentContext
  let eventEmitter: EventEmitter

  beforeEach(async () => {
    wallet = new InMemoryWallet()
    const storageService = new InMemoryStorageService<DidRecord>()
    eventEmitter = new EventEmitter(config.agentDependencies, new Subject())
    didRepository = new DidRepository(storageService, eventEmitter)

    agentContext = getAgentContext({
      wallet,
      registerInstances: [
        [DidRepository, didRepository],
        [InjectionSymbols.StorageService, storageService],
      ],
    })
    await wallet.createAndOpen(config.walletConfig)

    didResolverService = new DidResolverService(
      config.logger,
      new DidsModuleConfig({ resolvers: [new TdwDidResolver()] }),
      {} as unknown as DidRepository
    )
  })

  afterEach(async () => {
    await wallet.delete()
  })

  test('resolve a did and did document', async () => {
    const did =
      'did:tdw:QmbkyrrjFQ3Z2WiDfmesKpmeUhemaiqkWgwemovmVaTJfQ:demo.identifier.me:client:c9dd16b7-e079-43da-b0a9-36515e726c6f'

    const resolved = didResolverService.resolveDidDocument(agentContext, did)

    console.log(resolved)
    const didDocument = JsonTransformer.fromJSON(resolvedDidDocument, DidDocument)

    // make sure the dids are valid by matching them against our encoded variants
    expect(didDocumentJsonToNumAlgo1Did(didPeer1zQmY)).toBe(did)

    // If a did document was provided, we match it against the did document of the peer did
    // This validates whether we get the same did document
    if (didDocument) {
      expect(didDocument.toJSON()).toMatchObject(didPeer1zQmY)
    }

    const didDocumentRecord = new DidRecord({
      did: did,
      role: DidDocumentRole.Received,
      // If the method is a genesis doc (did:peer:1) we should store the document
      // Otherwise we only need to store the did itself (as the did can be generated)
      tags: {
        // We need to save the recipientKeys, so we can find the associated did
        // of a key when we receive a message from another connection.
        recipientKeyFingerprints: didDocument.recipientKeys.map((key) => key.fingerprint),
      },
    })

    await didRepository.save(agentContext, didDocumentRecord)

    // Then we save the did (not the did document) in the connection record
    // connectionRecord.theirDid = didPeer.did

    // Then when we want to send a message we can resolve the did document
    const { didDocument: resolvedDidDocument } = await didResolverService.resolve(agentContext, did)
    expect(resolvedDidDocument).toBeInstanceOf(DidDocument)
    expect(resolvedDidDocument?.toJSON()).toMatchObject(didPeer1zQmY)
  })
})
