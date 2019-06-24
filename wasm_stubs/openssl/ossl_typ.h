#ifndef _DML_WASM_STUB_OSSL_TYP_H_
#define _DML_WASM_STUB_OSSL_TYP_H_


typedef struct x509_st X509;
typedef struct x509_store_st X509_STORE;
typedef struct x509_store_ctx_st X509_STORE_CTX;

typedef struct ec_key_st EC_KEY;

typedef struct evp_pkey_st EVP_PKEY;

typedef struct bignum_st {} BIGNUM;

#define STACK_OF(type) struct stack_st_##type


STACK_OF(X509);


#define BN_num_bytes(a) 0

static inline BIGNUM *BN_bin2bn(const unsigned char *s, int len, BIGNUM *ret)
{
	return NULL;
}

static inline int BN_bn2bin(const BIGNUM *a, unsigned char *to)
{
	return 0;
}


#endif /* _DML_WASM_STUB_OSSL_TYP_H_ */
