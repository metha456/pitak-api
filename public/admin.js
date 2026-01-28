<script src="admin.js"></script>
console.log('ADMIN.JS LOADED');

const API = location.origin;
const adminKey = 'pitak-admin-2026';

window.downloadPDF = function(orderId, type) {
  alert('DOWNLOAD ' + orderId + ' ' + type);
};
