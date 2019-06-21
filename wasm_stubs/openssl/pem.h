#ifndef _DML_WASM_STUB_PEM_H_
#define _DML_WASM_STUB_PEM_H_

#include <openssl/ossl_typ.h>

static inline EVP_PKEY *PEM_read_PrivateKey(void *fp, void *a, void *b, void *c)
{
	return NULL;
}

static inline X509 *PEM_read_X509(void *fp, void *a, void *b, void *c)
{
	return NULL;
}

#endif
