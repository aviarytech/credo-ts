import type { AgentContext } from '../../../agent'
import type { Wallet } from '../../../wallet'

import { Subject } from 'rxjs'

import { InMemoryStorageService } from '../../../../../../tests/InMemoryStorageService'
import { InMemoryWallet } from '../../../../../../tests/InMemoryWallet'
import { getAgentConfig, getAgentContext } from '../../../../tests/helpers'
import { EventEmitter } from '../../../agent/EventEmitter'
import { InjectionSymbols } from '../../../constants'
import { CacheModuleConfig } from '../../../modules/cache/CacheModuleConfig'
import { InMemoryLruCache } from '../../cache/InMemoryLruCache'
import { DidsModuleConfig } from '../DidsModuleConfig'
import { DidDocument } from '../domain'
import { DidDocumentRole } from '../domain/DidDocumentRole'
import { TdwDidResolver } from '../methods'
import { DidRecord, DidRepository } from '../repository'
import { DidResolverService } from '../services'

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

    const cacheModuleConfig = new CacheModuleConfig({
      cache: new InMemoryLruCache({ limit: 1 }),
    })

    agentContext = getAgentContext({
      wallet,
      registerInstances: [
        [DidRepository, didRepository],
        [InjectionSymbols.StorageService, storageService],
        [CacheModuleConfig, cacheModuleConfig],
      ],
    })
    await wallet.createAndOpen(config.walletConfig)

    didResolverService = new DidResolverService(
      config.logger,
      new DidsModuleConfig({ resolvers: [new TdwDidResolver()] }),
      didRepository
    )
  })

  afterEach(async () => {
    await wallet.delete()
  })

  test('resolve a tdw did document', async () => {
    const did =
      'did:tdw:QmbkyrrjFQ3Z2WiDfmesKpmeUhemaiqkWgwemovmVaTJfQ:demo.identifier.me:client:c9dd16b7-e079-43da-b0a9-36515e726c6f'

    const { didDocument: resolvedDidDocument } = await didResolverService.resolve(agentContext, did)

    expect(resolvedDidDocument).toBeInstanceOf(DidDocument)
  })

  test('receive a tdw did and did document', async () => {
    const did =
      'did:tdw:QmbkyrrjFQ3Z2WiDfmesKpmeUhemaiqkWgwemovmVaTJfQ:demo.identifier.me:client:c9dd16b7-e079-43da-b0a9-36515e726c6f'
    const didDocument = new DidDocument({
      id: did,
      service: [],
      verificationMethod: [],
    })

    const didDocumentRecord = new DidRecord({
      did: did,
      role: DidDocumentRole.Received,
      didDocument: didDocument,
    })

    await didRepository.save(agentContext, didDocumentRecord)

    const { didDocument: resolvedDidDocument } = await didResolverService.resolve(agentContext, did)
    expect(resolvedDidDocument).toBeInstanceOf(DidDocument)
    expect(resolvedDidDocument?.id).toBe(did)
  })
})
