import codePush, { RemotePackage } from 'react-native-code-push'
const DeviceInfo = require('react-native-device-info')

const resolveAfter = <T>(ms: number, val: T): Promise<T> =>
  new Promise(r => setTimeout(() => r(val), ms))
const wait = (ms: number) => resolveAfter(ms, null)

interface DidTimeOutData {
  didTimeOut: true
  packagePromise: Promise<RemotePackage>
}

interface DidNotTimeOutData {
  didTimeOut: false
  package: RemotePackage
}

type CheckForUpdateResult = DidTimeOutData | DidNotTimeOutData

const checkForUpdateWithTimeout = (
  timeout: number,
): Promise<CheckForUpdateResult> => {
  const packagePromise = codePush.checkForUpdate() as Promise<RemotePackage>

  const augmentedPackagePromise = packagePromise.then(
    (pkg): DidNotTimeOutData => ({
      didTimeOut: false,
      package: pkg,
    }),
  )

  const timeoutPromise = resolveAfter<DidTimeOutData>(timeout, {
    didTimeOut: true,
    packagePromise,
  })

  return Promise.race([augmentedPackagePromise, timeoutPromise])
}

// TODO pkg
const installPackage = async (pkg: any, installImmediately: boolean) => {
  // Download if necessary
  // Docs: https://github.com/Microsoft/react-native-code-push/blob/master/docs/api-js.md#remotepackage
  let localPkg
  if (pkg.downloadUrl) {
    localPkg = await pkg.download()
  } else {
    localPkg = pkg
  }

  const installMode = installImmediately
    ? codePush.InstallMode.IMMEDIATE
    : codePush.InstallMode.ON_NEXT_RESUME

  await localPkg.install(installMode)
  await codePush.notifyAppReady()
}

/**
 * This function blocks for a given amount of time trying to install the newest version of your app.
 * 
 * @param checkingTimeout How long we should block and wait for a response
 * @param installationTimeout How long we should wait block and wait for the installation to finish
 * @param commenceBlockingUpdateCallback This gets called after we've found a new update and before we start installing
 */
export const autoUpdateWithTimeout = async (
  checkingTimeout: number,
  installationTimeout: number,
  commenceBlockingUpdateCallback: () => any = () => {},
) => {
  // Only execute this code if we're running on a real device
  let isEmulator = false
  if (DeviceInfo) {
    if (DeviceInfo.isEmulator()) {
      isEmulator = true
    }
  } else {
    console.log(
      'code-push-update-on-startup: react-native-device-info is not set up correctly',
    )
  }

  if (!isEmulator) {
    try {
      const updatePromise = await checkForUpdateWithTimeout(checkingTimeout)

      if (updatePromise.didTimeOut === true) {
        // If we didn't get a response within 3 secs, we navigate away and
        // keep waiting in the background for a response

        const { packagePromise } = updatePromise

        // Download app in the background and install on next resume
        packagePromise
          .then(pkg => {
            if (pkg) {
              installPackage(pkg, false)
            }
          })
          .catch(err => {
            // Ignore this error
          })
      } else if (updatePromise.didTimeOut === false) {
        await commenceBlockingUpdateCallback()

        const pkg = updatePromise.package
        if (pkg) {
          // Install the update but still navigate away after five seconds
          // so that we don't get stuck
          await Promise.race([
            installPackage(pkg, true),
            wait(installationTimeout),
          ])
        }
      }
    } catch (e) {
      // Ignore this error
    }
  }
}
