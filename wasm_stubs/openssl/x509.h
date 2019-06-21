#ifndef _DML_WASM_STUB_X509_H_
#define _DML_WASM_STUB_X509_H_

#include <openssl/ossl_typ.h>


static inline void X509_free(void *a)
{
}

X509_STORE *X509_STORE_new(void)
{
	return NULL;
}

static inline void X509_STORE_free(X509_STORE *a)
{
}

static inline int X509_STORE_load_locations(X509_STORE *ctx, const char *file, const char *dir)
{
	return 0;
}

X509_STORE_CTX *X509_STORE_CTX_new(void)
{
	return NULL;
}

static inline void X509_STORE_CTX_free(X509_STORE_CTX *ctx)
{
}

static inline int X509_STORE_CTX_init(X509_STORE_CTX *ctx, X509_STORE *store, X509 *x509, STACK_OF(X509) *chain)
{
	return 0;
}

static inline EVP_PKEY *X509_get_pubkey(X509 *x)
{
	return NULL;
}

static inline void *sk_X509_new_null(void)
{
	return NULL;
}

static inline void sk_X509_free(void *x)
{
}

static inline void sk_X509_push(void *x, void *y)
{
}

static inline void *sk_X509_pop(void *x)
{
	return NULL;
}

static inline X509 *d2i_X509(X509 **a, const unsigned char **pp, long length)
{
	return NULL;
}

static inline int i2d_X509(X509 *a, unsigned char **pp)
{
	return 0;
}

static inline int sk_X509_num(void *a)
{
	return 0;
}

static inline int X509_verify_cert(X509_STORE_CTX *ctx)
{
	return 0;
}

static inline void * sk_X509_value(void *ctx, int i)
{
	return NULL;
}

static inline int X509_check_host(X509 *cert, char *name, int a, int b, void *c)
{
	return 0;
}
#endif
