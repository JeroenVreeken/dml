#ifndef _DML_WASM_STUB_ECDSA_H_
#define _DML_WASM_STUB_ECDSA_H_

#include <openssl/ossl_typ.h>

void EC_KEY_free(EC_KEY *key);

typedef struct ECDSA_SIG_st {
	BIGNUM *r;
	BIGNUM *s;
} ECDSA_SIG;


static inline int ECDSA_do_verify(const unsigned char *dgst, int dgst_len, const ECDSA_SIG *sig, EC_KEY *eckey)
{
	return 0;
}

static inline ECDSA_SIG *ECDSA_SIG_new(void)
{
	return NULL;
}

static inline ECDSA_SIG *ECDSA_do_sign(const unsigned char *dgst, int dgst_len, EC_KEY *eckey)
{
	return NULL;
}

static inline void ECDSA_SIG_free(ECDSA_SIG *sig)
{
}

#endif
