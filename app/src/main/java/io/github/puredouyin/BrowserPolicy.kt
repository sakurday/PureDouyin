package io.github.puredouyin

import android.net.Uri

internal object BrowserPolicy {
    const val HOME = "https://www.douyin.com/?recommend=1&from_nav=1"
    private val internalDomains = setOf("douyin.com", "iesdouyin.com")

    fun isInternal(uri: Uri): Boolean {
        if (uri.scheme != "https" || uri.userInfo != null) return false
        val host = uri.host?.lowercase() ?: return false
        return internalDomains.any { host == it || host.endsWith(".$it") }
    }

    fun desktopUserAgent(defaultAgent: String): String {
        val chromeVersion = Regex("Chrome/[0-9.]+").find(defaultAgent)?.value ?: return defaultAgent
        return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) $chromeVersion Safari/537.36"
    }
}
