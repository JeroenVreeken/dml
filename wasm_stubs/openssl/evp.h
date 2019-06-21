#ifndef _DML_WASM_STUB_EVP_H_
#define _DML_WASM_STUB_EVP_H_

#include <openssl/ossl_typ.h>

static inline void OpenSSL_add_all_algorithms(void)
{
}

static inline void EVP_PKEY_free(EVP_PKEY *pkey)
{
}

static inline int EVP_PKEY_bits(const EVP_PKEY *pkey)
{
	return 0;
}

static inline struct ec_key_st *EVP_PKEY_get1_EC_KEY(EVP_PKEY *pkey)
{
	return NULL;
}

#endif
