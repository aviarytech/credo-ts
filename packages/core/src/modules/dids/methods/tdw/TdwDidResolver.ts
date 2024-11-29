import type { AgentContext } from '../../../../agent'
import type { DidResolver } from '../../domain/DidResolver'
import type { DidResolutionResult } from '../../types'

import { resolveDID } from 'trustdidweb-ts'

import { JsonTransformer } from '../../../../utils/JsonTransformer'
import { DidDocument } from '../../domain'

export class TdwDidResolver implements DidResolver {
  public readonly supportedMethods = ['tdw']

  public readonly allowsCaching = true
  public readonly allowsLocalDidRecord = true

  // FIXME: Would be nice if we don't have to provide a did resolver instance
  // private _resolverInstance = new Resolver()
  // private resolver = didWeb.getResolver()

  public async resolve(agentContext: AgentContext, did: string): Promise<DidResolutionResult> {
    const result = await resolveDID(did)

    let didDocument = null

    if (result.doc) {
      didDocument = JsonTransformer.fromJSON(result.doc, DidDocument)
    }

    return {
      didDocument,
      didResolutionMetadata: {
        servedFromCache: false,
        servedFromDidRecord: false,
      },
      didDocumentMetadata: result.meta,
    }
  }
}
