package com.hade.sdk

import kotlinx.serialization.Serializable
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

@Serializable
data class HadeDecisionResponse(
    val status: String,
    val decision: DecisionPayload? = null,
    val reasoning: List<String> = emptyList(),
    val confidence: Double = 0.0,
) {
    @Serializable
    data class DecisionPayload(
        val title: String,
        val distance: String,
        val eta: String? = null,
    )
}

class HadeSDK(
    private val baseUrl: String,
    private val client: OkHttpClient = OkHttpClient(),
) {
    suspend fun getDecision(): HadeDecisionResponse = request("initial", null)
    suspend fun regenerate(): HadeDecisionResponse = request("regenerate", null)
    suspend fun refine(tone: String? = null): HadeDecisionResponse = request("refine", tone)

    private fun request(mode: String, refineTone: String?): HadeDecisionResponse {
        val body = buildString {
            append("{" )
            append("\"mode\":\"")
            append(mode)
            append("\"")
            if (refineTone != null) {
                append(",\"signals\":[{\"type\":\"INTENT\",\"content\":\"refine:")
                append(refineTone)
                append("\"}]")
            }
            append("}")
        }.toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("$baseUrl/hade/decide")
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            require(response.isSuccessful) { "HADE request failed: ${response.code}" }
            return kotlinx.serialization.json.Json.decodeFromString(
                HadeDecisionResponse.serializer(),
                response.body!!.string(),
            )
        }
    }
}
