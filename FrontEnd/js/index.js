// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// Defining async function taking in JWT and URL
async function mcInfo(url, idToken) {

    //mcInfo
    var mcInfodata = API_URL + "getinfo/" + query_string;
    
    // Storing response
    const response = await fetch(mcInfodata, {
      method: 'get',
      headers: new Headers({
        'Authorization': idToken
      })
    });
    
    //Storing data in form of JSON
    var data = await response.json();
    if (response) {
        hideloader(data);
    }
    show(data);
}
 
// Function to hide the loaders
function hideloader(data) {
    var loads = document.getElementsByClassName("Loading");
    for(var i=0; i<loads.length;i++){
        loads[i].style.display = 'none';
    }
}
// Function to define innerHTML for HTML table
async function show(data) {
    var instance = data[1]["Instances"][0];
    document.getElementById('mcInfoDNS').innerHTML = instance["DomainName"];
    document.getElementById('mcInfoState').innerHTML = instance["State"];
    document.getElementById('mcInfoIP').innerHTML = instance["PublicIpAddress"];
    document.getElementById('mcInfoType').innerHTML = instance["InstanceType"];

    // Update power button based on state
    var powerBtn = document.getElementById('powerButton');
    if (powerBtn) {
      if (instance["State"] === "running") {
        powerBtn.textContent = 'Stop';
        powerBtn.className = 'btn-danger';
      } else {
        powerBtn.textContent = 'Start';
        powerBtn.className = '';
      }
    }

    //Check if Domain exists and then lookup IP to see if it matches IP on console.
    //Show card border as red/green based on DNS match
    var dnsCard = document.getElementById('mcInfoDNS').parentNode;
    if (data[1]["Instances"][0]["DomainName"] != "") {
      var DomainName2IP = await dnsLookup(data[1]["Instances"][0]["DomainName"]);
      if (DomainName2IP != data[1]["Instances"][0]["PublicIpAddress"]) {
        dnsCard.classList.add('card--danger');
        dnsCard.classList.remove('card--ok');
      }
      else {
        dnsCard.classList.add('card--ok');
        dnsCard.classList.remove('card--danger');
      }
    }
    else {
      document.getElementById('mcInfoDNS').innerHTML = "Loading...";
      dnsCard.classList.add('card--danger');
      dnsCard.classList.remove('card--ok');
    }

    // Show/hide admin section based on server state
    var adminSection = document.getElementById('adminSection');
    if (adminSection) {
      if (instance["State"] === "running") {
        adminSection.style.display = 'block';
        getAdminList();
      } else {
        adminSection.style.display = 'none';
      }
    }
}

function showAlert(text) {
      var al = document.getElementsByClassName("alert");
    document.getElementsByClassName("alertmsg")[0].innerHTML = text;
    al[0].style.display = 'block';
}

function dropdownMenu() {
  var ddc = document.getElementById("dropdownClick");
  if (ddc.className === "top-nav") {
    ddc.className += " responsive";
    // Change top-nav to top-nav.responsive on Click
  } else {
    ddc.className = "top-nav"
  }
}

async function stopServer() {
  var stopUrl = API_URL + "stop/" + query_string
  //checkLogin();
  var jwt = await getJwt();

  var msg = await fetch(stopUrl, {
    method: 'get',
    headers: new Headers({
      'Authorization': jwt
    })
  });

  var msgdata = await msg.json();
  showAlert(msgdata[0]);

  for (y=0; y<6; y++){
    await sleep(1000);
    mcInfo(API_URL, jwt);
  }
}

async function startServer() {
  var startUrl = API_URL + "start/" + query_string
  //checkLogin();
  var jwt = await getJwt();

  var msg = await fetch(startUrl, {
    method: 'get',
    headers: new Headers({
      'Authorization': jwt
    })
  });

  var msgdata = await msg.json();
  showAlert(msgdata[0]);

  for (y=0; y<6; y++){
    await sleep(1000);
    mcInfo(API_URL, jwt);
  }
}

async function resizeServer() {
  var SIZE = document.getElementById("instanceSize");
  var resizeUrl = API_URL + "resize/" + query_string + "&resize=" + SIZE.value
  //checkLogin();
  var jwt = await getJwt();

  var msg = await fetch(resizeUrl, {
    method: 'get',
    headers: new Headers({
      'Authorization': jwt
    })
  });

  var msgdata = await msg.json();
  showAlert(msgdata[0]);

  for (y=0; y<5; y++){
    await sleep(1000);
    mcInfo(API_URL, jwt);
  }
}

async function toggleServer() {
  var powerBtn = document.getElementById('powerButton');
  if (powerBtn.textContent === 'Stop') {
    showAlert('Stopping the Server');
    stopServer();
  } else {
    showAlert('Starting the Server');
    startServer();
  }
}

async function dnsLookup(dN) {
  var json = await fetch('https://cloudflare-dns.com/dns-query?name=' + dN, {    
    method: 'get',
    headers: new Headers({
    'accept': 'application/dns-json'
  })}).then(response => response.json());
  var DomainName2IP = ""
  try {
    DomainName2IP = json["Answer"][0]["data"];
  } catch(e) {
    console.log("DNS Lookup Failed for " + dN)
  }
  return(DomainName2IP);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updatelinks() {
  document.getElementById("home").setAttribute("href", mcCloudfrontUrl);
  document.getElementById("server").setAttribute("href", "https://console.aws.amazon.com/ec2/v2/home?#Instances:search=" + tagValue); 
  document.getElementById("cfnstack").setAttribute("href", "https://console.aws.amazon.com/cloudformation/home?#/stacks?filteringStatus=active&filteringText=" + stackname + "&viewNested=true&hideStacks=false&stackId=");
}


//////////////////// Cognito //////////////////////////



async function init() {
  const { Auth } = aws_amplify_auth;
  const { Amplify } = aws_amplify_core;

  updatelinks();

  Amplify.configure(aws_auth_config)

  await authIfNeeded();

  refreshData();
  setInterval(refreshData, 5000);

  fetchBilling();

  async function authIfNeeded() {
    try {     
      await Auth.currentAuthenticatedUser();
      console.log("True")
      return true
    }   
    catch(e) {
      console.log("False")
      Auth.federatedSignIn({
        provider: 'COGNITO',
        domain: mcCognitoDomainName
        });     
      return false   
    }
  } 


  async function getJwt2() {
    var jwt = Auth.currentSession()
        .then(res=>{
        
        let IdToken = res.getIdToken()
        let resJwt = IdToken.getJwtToken()

        //You can print them to see the full objects
        //console.log(`myIdToken: ${JSON.stringify(IdToken)}`)
        //console.log(`myJwt: ${resJwt}`)
        return resJwt
        })
        .catch(e => {console.log(e)})
    return jwt
  }

  async function refreshData() {
    var jwt2 = await getJwt2()
    return mcInfo(API_URL, jwt2);
  }


}

async function checkLogin() {
  if (!await isLoggedIn()) {
    DoSignIn()
  }
}

function DoSignIn() {
  Auth.federatedSignIn({
    provider: 'COGNITO',
    domain: mcCognitoDomainName
});
}

async function isLoggedIn() {
  try {     
    await Auth.currentAuthenticatedUser();
    console.log("True")
    return true
  }   
  catch(e) {
    console.log("False")     
    return false   
  } 
}

async function getJwt() {
  const { Amplify } = aws_amplify_core;
  const { Auth } = aws_amplify_auth;
  var jwt = Auth.currentSession()
      .then(res=>{

      let IdToken = res.getIdToken()
      let resJwt = IdToken.getJwtToken()

      //You can print them to see the full objects
      //console.log(`myIdToken: ${JSON.stringify(IdToken)}`)
      //console.log(`myJwt: ${resJwt}`)
      return resJwt
      })
      .catch(e => {console.log(e)})
  return jwt
}

//////////////////// Billing //////////////////////////

async function fetchBilling() {
  var jwt = await getJwt();
  var url = API_URL + "billing/" + query_string;
  var response = await fetch(url, {
    method: 'get',
    headers: new Headers({ 'Authorization': jwt })
  });
  var data = await response.json();

  if (data[1]) {
    document.getElementById('billingCurrent').textContent = '$' + data[1].currentCost;
    var forecast = data[1].forecastCost;
    document.getElementById('billingForecast').textContent =
        forecast === 'N/A' ? 'N/A' : '$' + forecast;
  }
}

//////////////////// Admin List //////////////////////////

async function getAdminList() {
  var jwt = await getJwt();
  var url = API_URL + "adminlist/" + query_string;
  var response = await fetch(url, {
    method: 'get',
    headers: new Headers({ 'Authorization': jwt })
  });
  var data = await response.json();
  renderAdminList(data);
}

function renderAdminList(steamIds) {
  var listEl = document.getElementById('adminListItems');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!Array.isArray(steamIds) || steamIds.length === 0) {
    listEl.innerHTML = '<li class="admin-empty">No admins configured</li>';
    return;
  }
  steamIds.forEach(function(id) {
    var li = document.createElement('li');
    li.textContent = id;
    var removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'btn-remove';
    removeBtn.onclick = function() { removeAdmin(id); };
    li.appendChild(removeBtn);
    listEl.appendChild(li);
  });
}

async function addAdmin() {
  var input = document.getElementById('steamIdInput');
  var steamId = input.value.trim();
  if (!steamId) return;
  if (!/^\d{17}$/.test(steamId)) {
    showAlert('Invalid Steam ID. Must be a 17-digit number.');
    return;
  }
  var jwt = await getJwt();
  var url = API_URL + "adminlist/" + query_string + "&action=add&steamid=" + steamId;
  var response = await fetch(url, {
    method: 'get',
    headers: new Headers({ 'Authorization': jwt })
  });
  var data = await response.json();
  var msg = Array.isArray(data) ? data[0] : (data.errorMessage || 'Unknown error');
  showAlert(msg);
  input.value = '';
  getAdminList();
}

async function removeAdmin(steamId) {
  var jwt = await getJwt();
  var url = API_URL + "adminlist/" + query_string + "&action=remove&steamid=" + steamId;
  var response = await fetch(url, {
    method: 'get',
    headers: new Headers({ 'Authorization': jwt })
  });
  var data = await response.json();
  var msg = Array.isArray(data) ? data[0] : (data.errorMessage || 'Unknown error');
  showAlert(msg);
  getAdminList();
}

function logout() {
    const { Amplify } = aws_amplify_core;
    const { Auth } = aws_amplify_auth;

    Amplify.configure(aws_auth_config)
    Auth.signOut({ global: true });
}
